import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { execute, one, rows, transaction } from '../db.js'
import { encryptSecret } from '../crypto.js'
import { calculateFees, type ClientPlan, type OperatorPlan } from '../fees.js'
import { acceptManagedRequest, managedService, suggestedManagedAgent } from '../managed.js'
import {
  asyncRoute,
  createOpaqueToken,
  HttpError,
  membershipFor,
  requireAuth,
  requireVerifiedEmail,
  sha256,
} from '../security.js'
import { assertSafeWebhookUrl, enqueueAgentWebhook } from '../webhooks.js'
import { sendOperationsNotification, sendSupportReceipt, sendTaskRequestReceipt, sendUpworkTransferReceipt } from '../mailer.js'
import {
  BUREAU_FAIR_QUOTE_TERMS_VERSION,
  budgetRangeForCents,
  calculateBureauCatalogQuote,
  normalizeUpworkJobUrl,
} from '../upwork-quote.js'
import { commercialReadiness } from '../commercial-readiness.js'
import { directContractUsesPublishedPrice } from '../direct-contract.js'
import { POLICY_VERSIONS } from '../legal-policy.js'

type GenericRow = RowDataPacket

const uuid = z.string().uuid()
const money = z.number().int().min(500).max(100_000_000)
const url = z.string().url().max(2048)

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value as T
  try { return JSON.parse(value) as T } catch { return fallback }
}

function publicAgent(row: GenericRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    avatarUrl: row.avatar_url,
    verificationLevel: row.verification_level,
    autonomyLevel: row.autonomy_level,
    pricingModel: row.pricing_model,
    basePriceCents: row.base_price_cents,
    hourlyRateCents: row.hourly_rate_cents,
    currency: row.currency,
    responseTimeMinutes: row.response_time_minutes,
    successRateBasisPoints: row.success_rate_basis_points,
    completedContracts: row.completed_contracts,
    averageRating: Number(row.average_rating ?? 0),
    reviewCount: row.review_count,
    operator: { name: row.operator_name, slug: row.operator_slug },
    capabilities: parseJson<string[]>(row.capabilities, []),
    publishedAt: row.published_at,
  }
}

function publicJob(row: GenericRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    category: row.category,
    deliverables: parseJson<string[]>(row.deliverables, []),
    requiredCapabilities: parseJson<string[]>(row.required_capabilities, []),
    autonomyLevel: row.autonomy_level,
    budgetMinCents: row.budget_min_cents,
    budgetMaxCents: row.budget_max_cents,
    currency: row.currency,
    deadlineAt: row.deadline_at,
    client: { name: row.client_name, slug: row.client_slug },
    proposalCount: Number(row.proposal_count ?? 0),
    publishedAt: row.published_at,
  }
}

export const publicRouter = Router()
export const marketplaceRouter = Router()
const managedTaskLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false })
const comparisonQuotePreviewLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })

const upworkQuoteCoreSchema = z.object({
  jobUrl: z.string().trim().min(20).max(2_048),
  serviceId: z.string().trim().min(2).max(80),
  scopeUnits: z.number().int().min(1).max(1_000_000),
}).strict()

function normalizedUpworkJobUrl(rawUrl: string) {
  try {
    return normalizeUpworkJobUrl(rawUrl)
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid Upwork job URL.', 'invalid_upwork_job_url')
  }
}

function publicManagedMatch(agent: GenericRow | null) {
  if (!agent) return null
  return {
    agentId: agent.id,
    slug: agent.slug,
    name: agent.name,
    category: agent.category,
    verificationLevel: agent.verification_level,
    responseTimeMinutes: Number(agent.response_time_minutes),
  }
}

function publicCatalogPackage(service: NonNullable<ReturnType<typeof managedService>>, scopeUnits: number, packageCount: number) {
  return {
    unitLabel: scopeUnits === 1 ? service.unitLabelSingular : service.unitLabel,
    unitLabelSingular: service.unitLabelSingular,
    unitCapacity: service.unitCapacity,
    maximumAutomaticUnits: service.maximumAutomaticUnits,
    requestedUnits: scopeUnits,
    packageCount,
    pricePerPackageCents: service.startingPriceCents,
    includedScope: service.includedScope,
    excludedScope: service.excludedScope,
  }
}

publicRouter.get('/readiness', (_req, res) => {
  res.setHeader('cache-control', 'public, max-age=60, stale-while-revalidate=300')
  res.json({ readiness: commercialReadiness() })
})

publicRouter.get('/pricing', (_req, res) => {
  res.json({
    client: [
      { id: 'client_starter', name: 'Client Starter', monthlyCents: 0, transactionFeeBasisPoints: 500 },
      { id: 'client_scale', name: 'Client Scale', monthlyCents: 14_900, transactionFeeBasisPoints: 300 },
    ],
    operator: [
      { id: 'operator_starter', name: 'Operator Starter', monthlyCents: 0, payoutFeeBasisPoints: 1_000 },
      { id: 'operator_pro', name: 'Operator Pro', monthlyCents: 4_900, payoutFeeBasisPoints: 700 },
    ],
    verifiedAgentOneTimeCents: 9_900,
    contractInitiationFeeCents: 0,
  })
})

publicRouter.get('/agents', asyncRoute(async (req, res) => {
  const query = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(80).optional(),
    verification: z.enum(['identity', 'capability', 'production']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(24),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  }).parse(req.query)
  const conditions = [`a.status = 'active'`]
  const values: unknown[] = []
  if (query.q) {
    conditions.push('(a.name LIKE ? OR a.tagline LIKE ? OR a.description LIKE ?)')
    const term = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
    values.push(term, term, term)
  }
  if (query.category) { conditions.push('a.category = ?'); values.push(query.category) }
  if (query.verification) { conditions.push('a.verification_level = ?'); values.push(query.verification) }
  values.push(query.limit, query.offset)
  const result = await rows<GenericRow>(
    `SELECT a.*, o.name AS operator_name, o.slug AS operator_slug,
       JSON_ARRAYAGG(ac.capability) AS capabilities
     FROM agents a JOIN organizations o ON o.id = a.operator_org_id
     LEFT JOIN agent_capabilities ac ON ac.agent_id = a.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY a.id ORDER BY a.verification_level DESC, a.average_rating DESC, a.completed_contracts DESC
     LIMIT ? OFFSET ?`,
    values,
  )
  res.json({ agents: result.map(publicAgent), pagination: { limit: query.limit, offset: query.offset, returned: result.length } })
}))

publicRouter.get('/agents/:slug', asyncRoute(async (req, res) => {
  const slug = z.string().trim().min(1).max(180).parse(req.params.slug)
  const agent = await one<GenericRow>(
    `SELECT a.*, o.name AS operator_name, o.slug AS operator_slug,
       JSON_ARRAYAGG(ac.capability) AS capabilities
     FROM agents a JOIN organizations o ON o.id = a.operator_org_id
     LEFT JOIN agent_capabilities ac ON ac.agent_id = a.id
     WHERE a.slug = ? AND a.status = 'active' GROUP BY a.id`,
    [slug],
  )
  if (!agent) throw new HttpError(404, 'Agent not found.', 'agent_not_found')
  const reviews = await rows<GenericRow>(
    `SELECT r.id, r.rating, r.title, r.body, r.created_at, u.display_name AS reviewer_name
     FROM reviews r JOIN users u ON u.id = r.reviewer_user_id
     WHERE r.agent_id = ? AND r.status = 'published' ORDER BY r.created_at DESC LIMIT 25`,
    [agent.id],
  )
  res.json({ agent: publicAgent(agent), reviews })
}))

publicRouter.get('/jobs', asyncRoute(async (req, res) => {
  const query = z.object({
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(24),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  }).parse(req.query)
  const conditions = [`j.status = 'open'`, `j.visibility = 'public'`]
  const values: unknown[] = []
  if (query.q) {
    conditions.push('(j.title LIKE ? OR j.summary LIKE ? OR j.description LIKE ?)')
    const term = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
    values.push(term, term, term)
  }
  if (query.category) { conditions.push('j.category = ?'); values.push(query.category) }
  values.push(query.limit, query.offset)
  const result = await rows<GenericRow>(
    `SELECT j.*, o.name AS client_name, o.slug AS client_slug, COUNT(p.id) AS proposal_count
     FROM jobs j JOIN organizations o ON o.id = j.client_org_id
     LEFT JOIN proposals p ON p.job_id = j.id AND p.status <> 'withdrawn'
     WHERE ${conditions.join(' AND ')} GROUP BY j.id ORDER BY j.published_at DESC LIMIT ? OFFSET ?`,
    values,
  )
  res.json({ jobs: result.map(publicJob), pagination: { limit: query.limit, offset: query.offset, returned: result.length } })
}))

publicRouter.get('/jobs/:slug', asyncRoute(async (req, res) => {
  const slug = z.string().trim().min(1).max(200).parse(req.params.slug)
  const job = await one<GenericRow>(
    `SELECT j.*, o.name AS client_name, o.slug AS client_slug, COUNT(p.id) AS proposal_count
     FROM jobs j JOIN organizations o ON o.id = j.client_org_id
     LEFT JOIN proposals p ON p.job_id = j.id AND p.status <> 'withdrawn'
     WHERE j.slug = ? AND j.status IN ('open','shortlisted','awarded','closed') AND j.visibility = 'public'
     GROUP BY j.id`,
    [slug],
  )
  if (!job) throw new HttpError(404, 'Job not found.', 'job_not_found')
  res.json({ job: publicJob(job) })
}))

publicRouter.post('/waitlist', asyncRoute(async (req, res) => {
  const input = z.object({
    email: z.string().trim().toLowerCase().email().max(320),
    audience: z.enum(['client', 'operator', 'partner', 'press']),
    source: z.string().trim().max(120).optional(),
    consent: z.literal(true),
  }).parse(req.body)
  await execute(
    `INSERT INTO waitlist_leads (id, email, audience, source, consent_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE source = VALUES(source), consent_at = VALUES(consent_at)`,
    [randomUUID(), input.email, input.audience, input.source ?? null],
  )
  res.status(201).json({ joined: true })
}))

publicRouter.post('/task-requests', managedTaskLimiter, asyncRoute(async (req, res) => {
  const input = z.object({
    contactName: z.string().trim().min(2).max(160),
    businessName: z.string().trim().max(200).optional().default(''),
    email: z.string().trim().toLowerCase().email().max(320),
    serviceId: z.string().trim().min(2).max(80),
    title: z.string().trim().min(8).max(220),
    details: z.string().trim().min(80).max(20_000),
    budgetRange: z.enum(['not-sure', 'under-250', '250-500', '500-1000', '1000-2500', '2500-plus']),
    desiredTiming: z.enum(['As soon as possible', 'Within 48 hours', 'Within one week', 'Within one month', 'Flexible']),
    source: z.string().trim().max(120).optional(),
    requesterType: z.enum(['human', 'agent']).default('human'),
    hiringMode: z.enum(['managed', 'marketplace']).default('managed'),
    website: z.string().max(0).optional().default(''),
    consent: z.literal(true),
  }).parse(req.body)
  const id = randomUUID()
  const service = input.hiringMode === 'managed' ? managedService(input.serviceId) : null
  const suggestedAgent = service ? await suggestedManagedAgent(input.serviceId) : null
  const clientOrganization = req.authUser?.organizations.find((organization) => organization.kind === 'client')
  await execute(
    `INSERT INTO task_requests
      (id, user_id, client_org_id, contact_name, business_name, email, service_id, title, details, budget_range,
       desired_timing, source, requester_type, hiring_mode, assigned_agent_id, quote_work_value_cents, quote_summary,
       quote_basis, status, consent_at, quoted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?)`,
    [id, req.authUser?.id ?? null, clientOrganization?.id ?? null, input.contactName, input.businessName || null,
      input.email, input.serviceId, input.title, input.details, input.budgetRange, input.desiredTiming,
      input.source ?? null, input.requesterType, input.hiringMode, suggestedAgent?.id ?? null,
      service?.startingPriceCents ?? null,
      service ? `${service.deliverables.join(', ')}. Typical delivery: ${service.turnaround}.` : null,
      service ? 'catalog' : null,
      service && suggestedAgent ? 'quoted' : 'new', service && suggestedAgent ? new Date() : null],
  )
  void Promise.all([
    sendTaskRequestReceipt(input.email, input.contactName, id, input.title),
    sendOperationsNotification(
      `New Bureau task: ${input.title}`,
      `${input.contactName}${input.businessName ? ` at ${input.businessName}` : ''} submitted ${input.hiringMode} work. Reference: ${id}.`,
      '/admin',
    ),
  ]).catch((error) => console.error(`[${req.requestId}] task notification failed:`, error instanceof Error ? error.message : 'unknown error'))
  res.status(201).json({
    request: { id, status: service && suggestedAgent ? 'quoted' : 'new' },
    match: suggestedAgent ? { agentId: suggestedAgent.id, name: suggestedAgent.name } : null,
    quote: service ? { workValueCents: service.startingPriceCents, turnaround: service.turnaround, deliverables: service.deliverables } : null,
  })
}))

publicRouter.post('/upwork-quotes/preview', comparisonQuotePreviewLimiter, asyncRoute(async (req, res) => {
  const input = upworkQuoteCoreSchema.parse(req.body)
  const jobUrl = normalizedUpworkJobUrl(input.jobUrl)
  const service = managedService(input.serviceId)
  if (!service) throw new HttpError(400, 'Choose a supported Bureau service for an automatic quote.', 'unsupported_quote_service')
  const agent = await suggestedManagedAgent(service.id)
  const catalogQuote = calculateBureauCatalogQuote(service, input.scopeUnits)
  const available = catalogQuote.status === 'available' && Boolean(agent)

  res.json({
    source: {
      platform: 'upwork',
      jobUrl,
      fetched: false,
      verificationStatus: 'url_validated',
      verificationMethod: 'url_format',
    },
    pricing: {
      status: available ? 'available' : 'manual_review',
      reason: catalogQuote.status === 'manual_review'
        ? catalogQuote.reason
        : agent
          ? 'Bureau applied the published bounded-package rate and found an active matching agent.'
          : 'The bounded catalog price is known, but no matching Bureau agent is accepting automatic work right now.',
    },
    comparison: {
      status: 'not_verified',
      savingsClaim: false,
      reason: 'Bureau does not access or verify Upwork budget or proposal data without authorized source access.',
    },
    catalog: publicCatalogPackage(service, input.scopeUnits, catalogQuote.packageCount),
    match: publicManagedMatch(agent),
    quote: available ? {
      workValueCents: catalogQuote.workValueCents,
      basis: catalogQuote.basis,
      packageCount: catalogQuote.packageCount,
      scopeUnits: input.scopeUnits,
      comparisonVerified: false,
      turnaround: service.turnaround,
      deliverables: service.deliverables,
    } : null,
  })
}))

publicRouter.post('/upwork-quotes', managedTaskLimiter, asyncRoute(async (req, res) => {
  const input = upworkQuoteCoreSchema.extend({
    contactName: z.string().trim().min(2).max(160),
    businessName: z.string().trim().max(200).optional().default(''),
    email: z.string().trim().toLowerCase().email().max(320),
    title: z.string().trim().min(8).max(220),
    details: z.string().trim().min(80).max(20_000),
    desiredTiming: z.enum(['As soon as possible', 'Within 48 hours', 'Within one week', 'Within one month', 'Flexible']),
    requesterType: z.enum(['human', 'agent']).default('human'),
    source: z.string().trim().max(120).optional(),
    website: z.string().max(0).optional().default(''),
    authorizationAttested: z.literal(true),
    catalogScopeAttested: z.literal(true),
    consent: z.literal(true),
  }).parse(req.body)

  const jobUrl = normalizedUpworkJobUrl(input.jobUrl)
  const service = managedService(input.serviceId)
  if (!service) throw new HttpError(400, 'Choose a supported Bureau service for this quote.', 'unsupported_quote_service')
  const agent = await suggestedManagedAgent(service.id)
  const catalogQuote = calculateBureauCatalogQuote(service, input.scopeUnits)
  const available = catalogQuote.status === 'available' && Boolean(agent)
  const quoteWorkValueCents = available ? catalogQuote.workValueCents : null
  const requestedUnitLabel = input.scopeUnits === 1 ? service.unitLabelSingular : service.unitLabel
  const packageDescription = `${catalogQuote.packageCount} ${catalogQuote.packageCount === 1 ? 'package' : 'packages'} covering ${input.scopeUnits.toLocaleString()} ${requestedUnitLabel}`
  const quoteSummary = available
    ? `Automatic bounded Bureau catalog quote: ${packageDescription} at $${(service.startingPriceCents / 100).toFixed(2)} per package; total work value $${(catalogQuote.workValueCents! / 100).toFixed(2)}. Included: ${service.includedScope.join(', ')}. Excluded: ${service.excludedScope.join(', ')}. Deliverables: ${service.deliverables.join(', ')}. Typical delivery: ${service.turnaround} per package. Bureau validated the Upwork URL format only and makes no external savings claim.`
    : catalogQuote.status === 'manual_review'
      ? `Manual scope review required: ${input.scopeUnits.toLocaleString()} ${requestedUnitLabel} exceeds the automatic limit of ${service.maximumAutomaticUnits.toLocaleString()}. No payable quote or external savings claim applies.`
      : `The bounded catalog calculation is ${packageDescription} at $${(service.startingPriceCents / 100).toFixed(2)} per package, but no matching active agent is currently available. No payable quote or external savings claim applies.`
  const id = randomUUID()
  const clientOrganization = req.authUser?.organizations.find((organization) => organization.kind === 'client')

  await execute(
    `INSERT INTO task_requests
      (id, user_id, client_org_id, contact_name, business_name, email, service_id, title, details, budget_range,
       desired_timing, source, source_platform, source_job_url, source_verification_status, source_verification_method,
       source_validated_at, source_verification_note, requester_type, hiring_mode, assigned_agent_id,
       quote_work_value_cents, quote_summary, quote_basis, catalog_scope_units, catalog_package_count,
       quote_policy_version, quote_policy_attested_at, status, consent_at, quoted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upwork', ?, 'url_validated', 'url_format', UTC_TIMESTAMP(3),
       ?, ?, 'managed', ?, ?, ?, 'catalog', ?, ?, ?, UTC_TIMESTAMP(3), ?, UTC_TIMESTAMP(3), ?)`,
    [id, req.authUser?.id ?? null, clientOrganization?.id ?? null, input.contactName, input.businessName || null,
      input.email, service.id, input.title, input.details, budgetRangeForCents(catalogQuote.workValueCents ?? service.startingPriceCents),
      input.desiredTiming, input.source ?? 'upwork-transfer', jobUrl,
      'URL host and path format validated locally. Bureau did not fetch the Upwork page or verify external price data.',
      input.requesterType, agent?.id ?? null, quoteWorkValueCents, quoteSummary, input.scopeUnits,
      catalogQuote.packageCount, BUREAU_FAIR_QUOTE_TERMS_VERSION, available ? 'quoted' : 'reviewing',
      available ? new Date() : null],
  )

  void Promise.all([
    sendUpworkTransferReceipt(input.email, input.contactName, id, input.title, agent?.name ?? 'Bureau concierge', quoteWorkValueCents),
    sendOperationsNotification(
      available ? `Automatic bounded Bureau quote: ${input.title}` : `Upwork-referenced request needs review: ${input.title}`,
      `${input.contactName}${input.businessName ? ` at ${input.businessName}` : ''} submitted an authorized Upwork job reference for ${input.scopeUnits.toLocaleString()} ${requestedUnitLabel}. ${available ? `Bureau applied its $${(quoteWorkValueCents! / 100).toFixed(2)} bounded catalog work value.` : quoteSummary} No external price or savings claim was made. Reference: ${id}.`,
      '/admin',
    ),
  ]).catch((error) => console.error(`[${req.requestId}] transfer quote notification failed:`, error instanceof Error ? error.message : 'unknown error'))

  res.status(201).json({
    request: { id, status: available ? 'quoted' : 'reviewing', continuePath: `/start?request=${id}` },
    source: {
      platform: 'upwork',
      jobUrl,
      fetched: false,
      verificationStatus: 'url_validated',
      verificationMethod: 'url_format',
    },
    pricing: {
      status: available ? 'available' : 'manual_review',
      reason: catalogQuote.status === 'manual_review'
        ? catalogQuote.reason
        : agent
          ? 'Bureau applied the published bounded-package rate and found an active matching agent.'
          : 'The bounded catalog price is known, but no matching active agent is available yet.',
      termsVersion: BUREAU_FAIR_QUOTE_TERMS_VERSION,
    },
    comparison: {
      status: 'not_verified',
      savingsClaim: false,
      reason: 'Bureau did not access or verify Upwork budget or proposal data.',
    },
    catalog: publicCatalogPackage(service, input.scopeUnits, catalogQuote.packageCount),
    match: publicManagedMatch(agent),
    quote: available ? {
      workValueCents: quoteWorkValueCents,
      basis: catalogQuote.basis,
      packageCount: catalogQuote.packageCount,
      scopeUnits: input.scopeUnits,
      comparisonVerified: false,
      turnaround: service.turnaround,
      deliverables: service.deliverables,
    } : null,
  })
}))

publicRouter.post('/support', asyncRoute(async (req, res) => {
  const input = z.object({
    email: z.string().trim().toLowerCase().email().max(320),
    category: z.enum(['account', 'payment', 'safety', 'privacy', 'legal', 'other']),
    subject: z.string().trim().min(5).max(180),
    message: z.string().trim().min(30).max(10_000),
    consent: z.literal(true),
  }).parse(req.body)
  const id = randomUUID()
  await execute(
    `INSERT INTO support_requests (id, user_id, email, category, subject, message, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [id, req.authUser?.id ?? null, input.email, input.category, input.subject, input.message],
  )
  void Promise.all([
    sendSupportReceipt(input.email, id, input.subject),
    sendOperationsNotification(
      `Bureau support: ${input.subject}`,
      `A ${input.category} support request was submitted by ${input.email}. Reference: ${id}.`,
      '/admin',
    ),
  ]).catch((error) => console.error(`[${req.requestId}] support notification failed:`, error instanceof Error ? error.message : 'unknown error'))
  res.status(201).json({ request: { id, status: 'open' } })
}))

marketplaceRouter.use(requireAuth, requireVerifiedEmail)

marketplaceRouter.post('/organizations', asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(160), kind: z.enum(['client', 'operator']) }).parse(req.body)
  const id = randomUUID()
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150) || 'organization'}-${id.slice(0, 8)}`
  const plan = input.kind === 'client' ? 'client_starter' : 'operator_starter'
  await transaction(async (connection) => {
    await connection.execute('INSERT INTO organizations (id, name, slug, kind, plan) VALUES (?, ?, ?, ?, ?)', [id, input.name, slug, input.kind, plan])
    await connection.execute(`INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, 'owner')`, [id, req.authUser!.id])
  })
  res.status(201).json({ organization: { id, name: input.name, slug, kind: input.kind, plan, memberRole: 'owner' } })
}))

marketplaceRouter.get('/organizations/:organizationId/task-requests', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  const membership = membershipFor(req, organizationId)
  if (membership.kind !== 'client') throw new HttpError(400, 'A client organization is required.', 'invalid_organization_kind')
  await execute(
    `UPDATE task_requests SET user_id = ?, client_org_id = ?
     WHERE client_org_id IS NULL AND LOWER(email) = LOWER(?)`,
    [req.authUser!.id, organizationId, req.authUser!.email],
  )
  const requests = await rows<GenericRow>(
    `SELECT tr.id, tr.service_id, tr.title, tr.details, tr.budget_range, tr.desired_timing, tr.requester_type,
      tr.hiring_mode, tr.status, tr.quote_work_value_cents, tr.quote_summary, tr.contract_id, tr.created_at,
      tr.source_platform, tr.source_reference_cents, tr.source_verification_status, tr.source_verification_note,
      tr.quote_basis, tr.quote_policy_version, tr.catalog_scope_units, tr.catalog_package_count,
      tr.guarantee_status, tr.guarantee_savings_cents, tr.guarantee_expires_at,
      a.name AS assigned_agent_name, a.slug AS assigned_agent_slug
     FROM task_requests tr LEFT JOIN agents a ON a.id = tr.assigned_agent_id
     WHERE tr.client_org_id = ? ORDER BY tr.created_at DESC LIMIT 200`,
    [organizationId],
  )
  res.json({ requests })
}))

marketplaceRouter.post('/task-requests/:requestId/accept', asyncRoute(async (req, res) => {
  const requestId = uuid.parse(req.params.requestId)
  const input = z.object({ organizationId: uuid }).parse(req.body)
  const membership = membershipFor(req, input.organizationId, ['owner', 'admin', 'member'])
  if (membership.kind !== 'client') throw new HttpError(400, 'A client organization is required.', 'invalid_organization_kind')
  const request = await one<GenericRow>('SELECT email, client_org_id FROM task_requests WHERE id = ?', [requestId])
  if (!request) throw new HttpError(404, 'Managed request not found.', 'task_request_not_found')
  if (!request.client_org_id && String(request.email).toLowerCase() !== req.authUser!.email.toLowerCase()) {
    throw new HttpError(403, 'Sign in with the email used for this request.', 'task_request_access_denied')
  }
  const result = await acceptManagedRequest(requestId, input.organizationId, req.authUser!.id, membership.plan as ClientPlan)
  res.status(201).json({ contract: { id: result.contractId, milestoneId: result.milestoneId, status: 'pending_funding', economics: result.fees }, reused: 'reused' in result ? result.reused : false })
}))

const clientKeyScopes = z.enum(['agents:read', 'tasks:write', 'tasks:read', 'tasks:approve', 'contracts:read'])

marketplaceRouter.get('/organizations/:organizationId/client-api-keys', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  const membership = membershipFor(req, organizationId, ['owner', 'admin'])
  if (membership.kind !== 'client') throw new HttpError(400, 'Client agent keys belong to client organizations.', 'invalid_organization_kind')
  const keys = await rows<GenericRow>(
    `SELECT id, name, key_prefix, scopes, last_used_at, expires_at, created_at FROM client_api_keys
     WHERE organization_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
    [organizationId],
  )
  res.json({ keys: keys.map((key) => ({ ...key, scopes: parseJson(key.scopes, []) })) })
}))

marketplaceRouter.post('/organizations/:organizationId/client-api-keys', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  const membership = membershipFor(req, organizationId, ['owner', 'admin'])
  if (membership.kind !== 'client') throw new HttpError(400, 'Client agent keys belong to client organizations.', 'invalid_organization_kind')
  const input = z.object({
    name: z.string().trim().min(2).max(120),
    scopes: z.array(clientKeyScopes).min(1).max(5),
    expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  }).parse(req.body)
  const activeKeys = await one<GenericRow>('SELECT COUNT(*) AS count FROM client_api_keys WHERE organization_id = ? AND revoked_at IS NULL', [organizationId])
  if (Number(activeKeys?.count ?? 0) >= 10) throw new HttpError(409, 'Revoke an existing key before creating another.', 'client_key_limit_reached')
  const secret = `bc_live_${createOpaqueToken(32)}`
  const keyId = randomUUID()
  await execute(
    `INSERT INTO client_api_keys (id, organization_id, created_by_user_id, name, key_prefix, key_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${input.expiresInDays ? 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY)' : 'NULL'})`,
    input.expiresInDays
      ? [keyId, organizationId, req.authUser!.id, input.name, secret.slice(0, 20), sha256(secret), JSON.stringify([...new Set(input.scopes)]), input.expiresInDays]
      : [keyId, organizationId, req.authUser!.id, input.name, secret.slice(0, 20), sha256(secret), JSON.stringify([...new Set(input.scopes)])],
  )
  res.status(201).json({ apiKey: { id: keyId, prefix: secret.slice(0, 20), secret, scopes: input.scopes } })
}))

marketplaceRouter.delete('/organizations/:organizationId/client-api-keys/:keyId', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  const keyId = uuid.parse(req.params.keyId)
  const membership = membershipFor(req, organizationId, ['owner', 'admin'])
  if (membership.kind !== 'client') throw new HttpError(400, 'Client agent keys belong to client organizations.', 'invalid_organization_kind')
  await execute('UPDATE client_api_keys SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ? AND organization_id = ?', [keyId, organizationId])
  res.status(204).end()
}))

const agentSchema = z.object({
  organizationId: uuid,
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().min(10).max(220),
  description: z.string().trim().min(100).max(10_000),
  category: z.string().trim().min(2).max(80),
  autonomyLevel: z.enum(['assistive', 'supervised', 'autonomous']),
  pricingModel: z.enum(['fixed', 'hourly', 'usage', 'quote']),
  basePriceCents: money.nullable().optional(),
  hourlyRateCents: money.nullable().optional(),
  capabilities: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
  endpointUrl: url.nullable().optional(),
  webhookUrl: url.nullable().optional(),
  acceptOperatorTerms: z.literal(true),
})

marketplaceRouter.post('/agents', asyncRoute(async (req, res) => {
  const input = agentSchema.parse(req.body)
  const membership = membershipFor(req, input.organizationId, ['owner', 'admin'])
  if (membership.kind !== 'operator') throw new HttpError(400, 'An operator organization is required.', 'invalid_organization_kind')
  const agentCount = await one<GenericRow>('SELECT COUNT(*) AS count FROM agents WHERE operator_org_id = ?', [input.organizationId])
  if (membership.plan === 'operator_starter' && Number(agentCount?.count ?? 0) >= 1) {
    throw new HttpError(402, 'Operator Pro is required to register more than one agent.', 'plan_limit_reached')
  }
  const agentId = randomUUID()
  const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 140) || 'agent'}-${agentId.slice(0, 8)}`
  const safeWebhookUrl = input.webhookUrl ? await assertSafeWebhookUrl(input.webhookUrl) : null
  const webhookSecret = safeWebhookUrl ? `whsec_${createOpaqueToken(32)}` : null
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO agents
       (id, operator_org_id, slug, name, tagline, description, category, autonomy_level, pricing_model,
        base_price_cents, hourly_rate_cents, endpoint_url, webhook_url, webhook_secret_ciphertext, status, terms_accepted_at, terms_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', UTC_TIMESTAMP(3), ?)`,
      [agentId, input.organizationId, slug, input.name, input.tagline, input.description, input.category,
        input.autonomyLevel, input.pricingModel, input.basePriceCents ?? null, input.hourlyRateCents ?? null,
        input.endpointUrl ?? null, safeWebhookUrl, webhookSecret ? encryptSecret(webhookSecret) : null, POLICY_VERSIONS.operator_terms],
    )
    for (const capability of [...new Set(input.capabilities.map((item) => item.toLowerCase()))]) {
      await connection.execute('INSERT INTO agent_capabilities (agent_id, capability) VALUES (?, ?)', [agentId, capability])
    }
    await connection.execute(
      `INSERT INTO agent_policies (agent_id, require_approval_for) VALUES (?, ?)`,
      [agentId, JSON.stringify(['external_communication', 'production_deployment', 'payments', 'destructive_changes'])],
    )
    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, organization_id, action, target_type, target_id)
       VALUES (?, ?, 'agent.registered', 'agent', ?)`,
      [req.authUser!.id, input.organizationId, agentId],
    )
  })
  res.status(201).json({ agent: { id: agentId, slug, status: 'review' }, webhookSecret })
}))

marketplaceRouter.patch('/agents/:agentId/integration', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  const input = z.object({
    webhookUrl: url.nullable(),
    rotateWebhookSecret: z.boolean().default(false),
    maxContractValueCents: z.number().int().min(500).max(100_000_000).optional(),
    maxConcurrentContracts: z.number().int().min(1).max(100).optional(),
    requireApprovalFor: z.array(z.enum(['external_communication', 'production_deployment', 'payments', 'destructive_changes'])).optional(),
    autoProposeMinMatchBasisPoints: z.number().int().min(8000).max(10000).nullable().optional(),
  }).parse(req.body)
  const agent = await one<GenericRow>('SELECT operator_org_id, webhook_secret_ciphertext FROM agents WHERE id = ?', [agentId])
  if (!agent) throw new HttpError(404, 'Agent not found.', 'agent_not_found')
  membershipFor(req, String(agent.operator_org_id), ['owner', 'admin'])
  const safeWebhookUrl = input.webhookUrl ? await assertSafeWebhookUrl(input.webhookUrl) : null
  const shouldRotate = Boolean(safeWebhookUrl && (input.rotateWebhookSecret || !agent.webhook_secret_ciphertext))
  const webhookSecret = shouldRotate ? `whsec_${createOpaqueToken(32)}` : null
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE agents SET webhook_url = ?, webhook_secret_ciphertext = CASE WHEN ? IS NULL THEN NULL WHEN ? IS NOT NULL THEN ? ELSE webhook_secret_ciphertext END WHERE id = ?`,
      [safeWebhookUrl, safeWebhookUrl, webhookSecret, webhookSecret ? encryptSecret(webhookSecret) : null, agentId],
    )
    await connection.execute(
      `UPDATE agent_policies SET
       max_contract_value_cents = COALESCE(?, max_contract_value_cents),
       max_concurrent_contracts = COALESCE(?, max_concurrent_contracts),
       require_approval_for = COALESCE(?, require_approval_for),
       auto_propose_min_match_basis_points = ? WHERE agent_id = ?`,
      [input.maxContractValueCents ?? null, input.maxConcurrentContracts ?? null,
        input.requireApprovalFor ? JSON.stringify(input.requireApprovalFor) : null,
        input.autoProposeMinMatchBasisPoints ?? null, agentId],
    )
  })
  res.json({ updated: true, webhookSecret })
}))

marketplaceRouter.get('/organizations/:organizationId/agents', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  membershipFor(req, organizationId)
  const agents = await rows<GenericRow>('SELECT * FROM agents WHERE operator_org_id = ? ORDER BY created_at DESC', [organizationId])
  res.json({ agents })
}))

marketplaceRouter.post('/agents/:agentId/contracts', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  const input = z.object({
    clientOrganizationId: uuid,
    title: z.string().trim().min(10).max(180),
    scope: z.string().trim().min(100).max(20_000),
    milestones: z.array(z.object({
      title: z.string().trim().min(3).max(180),
      description: z.string().trim().min(10).max(2_000),
      amountCents: money,
      dueAt: z.string().datetime().nullable().optional(),
    })).min(1).max(20),
  }).parse(req.body)
  const clientMembership = membershipFor(req, input.clientOrganizationId, ['owner', 'admin', 'member'])
  if (clientMembership.kind !== 'client') throw new HttpError(400, 'A client organization is required.', 'invalid_organization_kind')
  const agent = await one<GenericRow>(
    `SELECT a.operator_org_id, a.status, a.base_price_cents, co.plan AS client_plan, oo.plan AS operator_plan
     FROM agents a JOIN organizations co ON co.id = ? JOIN organizations oo ON oo.id = a.operator_org_id WHERE a.id = ?`,
    [input.clientOrganizationId, agentId],
  )
  if (!agent || agent.status !== 'active') throw new HttpError(409, 'This agent is not accepting contracts.', 'agent_not_available')
  const total = input.milestones.reduce((sum, milestone) => sum + milestone.amountCents, 0)
  if (!directContractUsesPublishedPrice(total, agent.base_price_cents)) {
    throw new HttpError(409, 'Direct hire must use the agent’s published package price. Post a job for bids when the scope needs custom pricing.', 'published_price_required')
  }
  const fees = calculateFees(total, agent.client_plan as ClientPlan, agent.operator_plan as OperatorPlan)
  const contractId = randomUUID()
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO contracts
       (id, client_org_id, operator_org_id, agent_id, title, scope, total_work_value_cents, client_fee_basis_points, operator_fee_basis_points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contractId, input.clientOrganizationId, agent.operator_org_id, agentId, input.title, input.scope, total, fees.clientFeeBasisPoints, fees.operatorFeeBasisPoints],
    )
    for (const [index, milestone] of input.milestones.entries()) {
      await connection.execute(
        `INSERT INTO milestones (id, contract_id, sequence_number, title, description, work_value_cents, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), contractId, index + 1, milestone.title, milestone.description, milestone.amountCents, milestone.dueAt ? new Date(milestone.dueAt) : null],
      )
    }
    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, organization_id, action, target_type, target_id) VALUES (?, ?, 'contract.direct_created', 'contract', ?)`,
      [req.authUser!.id, input.clientOrganizationId, contractId],
    )
  })
  await enqueueAgentWebhook(agentId, 'contract.created', { contractId, direct: true, status: 'pending_funding' })
  res.status(201).json({ contract: { id: contractId, status: 'pending_funding', economics: fees } })
}))

marketplaceRouter.post('/agents/:agentId/api-keys', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  const input = z.object({
    name: z.string().trim().min(2).max(120),
    scopes: z.array(z.enum(['jobs:read', 'proposals:write', 'messages:read', 'messages:write', 'deliverables:write', 'heartbeat:write'])).min(1),
    expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  }).parse(req.body)
  const agent = await one<GenericRow>('SELECT operator_org_id FROM agents WHERE id = ?', [agentId])
  if (!agent) throw new HttpError(404, 'Agent not found.', 'agent_not_found')
  membershipFor(req, String(agent.operator_org_id), ['owner', 'admin'])
  const secret = `br_live_${createOpaqueToken(32)}`
  const keyId = randomUUID()
  await execute(
    `INSERT INTO agent_api_keys (id, agent_id, name, key_prefix, key_hash, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ${input.expiresInDays ? 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY)' : 'NULL'})`,
    input.expiresInDays
      ? [keyId, agentId, input.name, secret.slice(0, 20), sha256(secret), JSON.stringify([...new Set(input.scopes)]), input.expiresInDays]
      : [keyId, agentId, input.name, secret.slice(0, 20), sha256(secret), JSON.stringify([...new Set(input.scopes)])],
  )
  res.status(201).json({ apiKey: { id: keyId, prefix: secret.slice(0, 20), secret, scopes: input.scopes } })
}))

marketplaceRouter.delete('/agents/:agentId/api-keys/:keyId', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  const keyId = uuid.parse(req.params.keyId)
  const agent = await one<GenericRow>('SELECT operator_org_id FROM agents WHERE id = ?', [agentId])
  if (!agent) throw new HttpError(404, 'Agent not found.', 'agent_not_found')
  membershipFor(req, String(agent.operator_org_id), ['owner', 'admin'])
  await execute('UPDATE agent_api_keys SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ? AND agent_id = ?', [keyId, agentId])
  res.status(204).end()
}))

const jobSchema = z.object({
  organizationId: uuid,
  title: z.string().trim().min(10).max(180),
  summary: z.string().trim().min(20).max(300),
  description: z.string().trim().min(100).max(20_000),
  category: z.string().trim().min(2).max(80),
  deliverables: z.array(z.string().trim().min(3).max(300)).min(1).max(20),
  requiredCapabilities: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
  autonomyLevel: z.enum(['assistive', 'supervised', 'autonomous']),
  budgetMinCents: money,
  budgetMaxCents: money,
  deadlineAt: z.string().datetime().nullable().optional(),
  visibility: z.enum(['public', 'invite_only', 'private']).default('public'),
  publish: z.boolean().default(true),
})

marketplaceRouter.post('/jobs', asyncRoute(async (req, res) => {
  const input = jobSchema.parse(req.body)
  const membership = membershipFor(req, input.organizationId, ['owner', 'admin', 'member'])
  if (membership.kind !== 'client') throw new HttpError(400, 'A client organization is required.', 'invalid_organization_kind')
  if (input.budgetMaxCents < input.budgetMinCents) throw new HttpError(400, 'Maximum budget must be at least the minimum.', 'invalid_budget')
  const id = randomUUID()
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 160)}-${id.slice(0, 8)}`
  await execute(
    `INSERT INTO jobs
     (id, client_org_id, created_by_user_id, slug, title, summary, description, category, deliverables,
      required_capabilities, autonomy_level, budget_min_cents, budget_max_cents, deadline_at, visibility, status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${input.publish ? 'UTC_TIMESTAMP(3)' : 'NULL'})`,
    [id, input.organizationId, req.authUser!.id, slug, input.title, input.summary, input.description, input.category,
      JSON.stringify(input.deliverables), JSON.stringify(input.requiredCapabilities), input.autonomyLevel,
      input.budgetMinCents, input.budgetMaxCents, input.deadlineAt ? new Date(input.deadlineAt) : null,
      input.visibility, input.publish ? 'open' : 'draft'],
  )
  res.status(201).json({ job: { id, slug, status: input.publish ? 'open' : 'draft' } })
}))

marketplaceRouter.get('/organizations/:organizationId/jobs', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  membershipFor(req, organizationId)
  const jobs = await rows<GenericRow>(
    `SELECT j.*, COUNT(p.id) AS proposal_count FROM jobs j LEFT JOIN proposals p ON p.job_id = j.id
     WHERE j.client_org_id = ? GROUP BY j.id ORDER BY j.created_at DESC`,
    [organizationId],
  )
  res.json({ jobs })
}))

marketplaceRouter.get('/organizations/:organizationId/proposals', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  const membership = membershipFor(req, organizationId)
  if (membership.kind !== 'operator') throw new HttpError(400, 'An operator organization is required.', 'invalid_organization_kind')
  const proposals = await rows<GenericRow>(
    `SELECT p.id, p.status, p.amount_cents, p.duration_days, p.created_at, p.updated_at,
      j.id AS job_id, j.slug AS job_slug, j.title AS job_title, j.status AS job_status, j.category,
      a.id AS agent_id, a.name AS agent_name, co.name AS client_name,
      c.id AS contract_id, c.status AS contract_status
     FROM proposals p JOIN agents a ON a.id = p.agent_id JOIN jobs j ON j.id = p.job_id
     JOIN organizations co ON co.id = j.client_org_id LEFT JOIN contracts c ON c.proposal_id = p.id
     WHERE a.operator_org_id = ? ORDER BY p.updated_at DESC LIMIT 250`,
    [organizationId],
  )
  res.json({ proposals })
}))

const proposalSchema = z.object({
  agentId: uuid,
  amountCents: money,
  durationDays: z.number().int().min(1).max(365),
  approach: z.string().trim().min(100).max(10_000),
  milestones: z.array(z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(2_000),
    amountCents: money,
    dueInDays: z.number().int().min(1).max(365),
  })).min(1).max(20),
})

marketplaceRouter.post('/jobs/:jobId/proposals', asyncRoute(async (req, res) => {
  const jobId = uuid.parse(req.params.jobId)
  const input = proposalSchema.parse(req.body)
  const agent = await one<GenericRow>('SELECT operator_org_id, status FROM agents WHERE id = ?', [input.agentId])
  if (!agent) throw new HttpError(404, 'Agent not found.', 'agent_not_found')
  membershipFor(req, String(agent.operator_org_id), ['owner', 'admin', 'member'])
  if (!['review', 'active'].includes(String(agent.status))) throw new HttpError(409, 'Agent is not eligible to propose.', 'agent_not_eligible')
  const job = await one<GenericRow>(`SELECT status FROM jobs WHERE id = ?`, [jobId])
  if (!job || job.status !== 'open') throw new HttpError(409, 'This job is not accepting proposals.', 'job_not_open')
  const milestoneTotal = input.milestones.reduce((sum, milestone) => sum + milestone.amountCents, 0)
  if (milestoneTotal !== input.amountCents) throw new HttpError(400, 'Milestone amounts must equal the proposal total.', 'milestone_total_mismatch')
  const id = randomUUID()
  try {
    await execute(
      `INSERT INTO proposals (id, job_id, agent_id, submitted_by_user_id, amount_cents, duration_days, approach, milestones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, jobId, input.agentId, req.authUser!.id, input.amountCents, input.durationDays, input.approach, JSON.stringify(input.milestones)],
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new HttpError(409, 'This agent already submitted a proposal.', 'proposal_exists')
    throw error
  }
  res.status(201).json({ proposal: { id, status: 'submitted' } })
}))

marketplaceRouter.get('/jobs/:jobId/proposals', asyncRoute(async (req, res) => {
  const jobId = uuid.parse(req.params.jobId)
  const job = await one<GenericRow>('SELECT client_org_id FROM jobs WHERE id = ?', [jobId])
  if (!job) throw new HttpError(404, 'Job not found.', 'job_not_found')
  membershipFor(req, String(job.client_org_id))
  const proposals = await rows<GenericRow>(
    `SELECT p.*, a.name AS agent_name, a.slug AS agent_slug, a.verification_level, a.average_rating,
       o.name AS operator_name
     FROM proposals p JOIN agents a ON a.id = p.agent_id JOIN organizations o ON o.id = a.operator_org_id
     WHERE p.job_id = ? ORDER BY p.created_at ASC`,
    [jobId],
  )
  res.json({ proposals: proposals.map((proposal) => ({ ...proposal, milestones: parseJson(proposal.milestones, []) })) })
}))

marketplaceRouter.patch('/proposals/:proposalId/status', asyncRoute(async (req, res) => {
  const proposalId = uuid.parse(req.params.proposalId)
  const input = z.object({ status: z.enum(['submitted', 'shortlisted']) }).parse(req.body)
  const proposal = await one<GenericRow>(
    `SELECT p.status, p.agent_id, j.client_org_id, j.status AS job_status
     FROM proposals p JOIN jobs j ON j.id = p.job_id WHERE p.id = ?`,
    [proposalId],
  )
  if (!proposal) throw new HttpError(404, 'Proposal not found.', 'proposal_not_found')
  membershipFor(req, String(proposal.client_org_id), ['owner', 'admin', 'member'])
  if (proposal.job_status !== 'open' || !['submitted', 'shortlisted'].includes(String(proposal.status))) {
    throw new HttpError(409, 'Proposal decision can no longer be changed.', 'proposal_not_available')
  }
  const result = await execute(
    `UPDATE proposals p JOIN jobs j ON j.id = p.job_id SET p.status = ?
     WHERE p.id = ? AND p.status IN ('submitted','shortlisted') AND j.status = 'open'`,
    [input.status, proposalId],
  )
  if (!result.affectedRows) throw new HttpError(409, 'Proposal decision can no longer be changed.', 'proposal_not_available')
  await enqueueAgentWebhook(String(proposal.agent_id), 'proposal.status_changed', { proposalId, status: input.status })
  res.json({ proposal: { id: proposalId, status: input.status } })
}))

marketplaceRouter.post('/proposals/:proposalId/accept', asyncRoute(async (req, res) => {
  const proposalId = uuid.parse(req.params.proposalId)
  const contractId = randomUUID()
  const result = await transaction(async (connection) => {
    const [records] = await connection.execute<RowDataPacket[]>(
      `SELECT p.*, j.client_org_id, j.title, j.description, j.status AS job_status,
        a.operator_org_id, co.plan AS client_plan, oo.plan AS operator_plan
       FROM proposals p JOIN jobs j ON j.id = p.job_id JOIN agents a ON a.id = p.agent_id
       JOIN organizations co ON co.id = j.client_org_id JOIN organizations oo ON oo.id = a.operator_org_id
       WHERE p.id = ? FOR UPDATE`,
      [proposalId],
    )
    const proposal = records[0] as GenericRow | undefined
    if (!proposal) throw new HttpError(404, 'Proposal not found.', 'proposal_not_found')
    membershipFor(req, String(proposal.client_org_id), ['owner', 'admin', 'member'])
    if (proposal.job_status !== 'open' || !['submitted', 'shortlisted'].includes(String(proposal.status))) throw new HttpError(409, 'Proposal is no longer available.', 'proposal_not_available')
    const fees = calculateFees(Number(proposal.amount_cents), proposal.client_plan as ClientPlan, proposal.operator_plan as OperatorPlan)
    const milestones = parseJson<Array<{ title: string; description: string; amountCents: number; dueInDays: number }>>(proposal.milestones, [])
    await connection.execute(
      `INSERT INTO contracts
       (id, job_id, proposal_id, client_org_id, operator_org_id, agent_id, title, scope, total_work_value_cents,
        client_fee_basis_points, operator_fee_basis_points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contractId, proposal.job_id, proposalId, proposal.client_org_id, proposal.operator_org_id, proposal.agent_id,
        proposal.title, proposal.description, proposal.amount_cents, fees.clientFeeBasisPoints, fees.operatorFeeBasisPoints],
    )
    for (const [index, milestone] of milestones.entries()) {
      await connection.execute(
        `INSERT INTO milestones (id, contract_id, sequence_number, title, description, work_value_cents, due_at)
         VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY))`,
        [randomUUID(), contractId, index + 1, milestone.title, milestone.description, milestone.amountCents, milestone.dueInDays],
      )
    }
    await connection.execute(`UPDATE proposals SET status = IF(id = ?, 'accepted', 'declined') WHERE job_id = ?`, [proposalId, proposal.job_id])
    await connection.execute(`UPDATE jobs SET status = 'awarded' WHERE id = ?`, [proposal.job_id])
    return { fees, agentId: String(proposal.agent_id), jobId: String(proposal.job_id) }
  })
  await enqueueAgentWebhook(result.agentId, 'contract.created', { contractId, jobId: result.jobId, status: 'pending_funding' })
  res.status(201).json({ contract: { id: contractId, status: 'pending_funding', economics: result.fees } })
}))

marketplaceRouter.get('/organizations/:organizationId/contracts', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  membershipFor(req, organizationId)
  const contracts = await rows<GenericRow>(
    `SELECT c.*, a.name AS agent_name,
      (SELECT COUNT(*) FROM milestones m WHERE m.contract_id = c.id) AS milestone_count,
      (SELECT COUNT(*) FROM milestones m WHERE m.contract_id = c.id AND m.status = 'released') AS released_count
     FROM contracts c JOIN agents a ON a.id = c.agent_id
     WHERE c.client_org_id = ? OR c.operator_org_id = ? ORDER BY c.updated_at DESC`,
    [organizationId, organizationId],
  )
  res.json({ contracts })
}))

marketplaceRouter.get('/contracts/:contractId', asyncRoute(async (req, res) => {
  const contractId = uuid.parse(req.params.contractId)
  const contract = await one<GenericRow>(
    `SELECT c.*, a.name AS agent_name, a.slug AS agent_slug, co.name AS client_name, oo.name AS operator_name
     FROM contracts c JOIN agents a ON a.id = c.agent_id
     JOIN organizations co ON co.id = c.client_org_id JOIN organizations oo ON oo.id = c.operator_org_id
     WHERE c.id = ?`,
    [contractId],
  )
  if (!contract) throw new HttpError(404, 'Contract not found.', 'contract_not_found')
  const allowed = req.authUser!.organizations.some((organization) => [contract.client_org_id, contract.operator_org_id].includes(organization.id))
  if (!allowed && req.authUser!.platformRole === 'user') throw new HttpError(403, 'Contract access denied.', 'contract_access_denied')
  const milestones = await rows<GenericRow>('SELECT * FROM milestones WHERE contract_id = ? ORDER BY sequence_number', [contractId])
  const messages = await rows<GenericRow>(
    `SELECT m.*, u.display_name AS sender_user_name, a.name AS sender_agent_name
     FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id LEFT JOIN agents a ON a.id = m.sender_agent_id
     WHERE m.contract_id = ? ORDER BY m.created_at ASC LIMIT 500`,
    [contractId],
  )
  const deliverables = await rows<GenericRow>('SELECT * FROM deliverables WHERE milestone_id IN (SELECT id FROM milestones WHERE contract_id = ?) ORDER BY created_at', [contractId])
  res.json({ contract, milestones, messages, deliverables })
}))

marketplaceRouter.post('/contracts/:contractId/messages', asyncRoute(async (req, res) => {
  const contractId = uuid.parse(req.params.contractId)
  const { body } = z.object({ body: z.string().trim().min(1).max(10_000) }).parse(req.body)
  const contract = await one<GenericRow>('SELECT client_org_id, operator_org_id FROM contracts WHERE id = ?', [contractId])
  if (!contract) throw new HttpError(404, 'Contract not found.', 'contract_not_found')
  const allowed = req.authUser!.organizations.some((organization) => [contract.client_org_id, contract.operator_org_id].includes(organization.id))
  if (!allowed) throw new HttpError(403, 'Contract access denied.', 'contract_access_denied')
  const id = randomUUID()
  await execute('INSERT INTO messages (id, contract_id, sender_user_id, body) VALUES (?, ?, ?, ?)', [id, contractId, req.authUser!.id, body])
  const agent = await one<GenericRow>('SELECT agent_id FROM contracts WHERE id = ?', [contractId])
  if (agent) await enqueueAgentWebhook(String(agent.agent_id), 'message.created', { contractId, messageId: id })
  res.status(201).json({ message: { id, body, senderUserId: req.authUser!.id, createdAt: new Date().toISOString() } })
}))

marketplaceRouter.post('/milestones/:milestoneId/deliverables', asyncRoute(async (req, res) => {
  const milestoneId = uuid.parse(req.params.milestoneId)
  const input = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(10_000),
    artifactUrl: url.nullable().optional(),
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  }).parse(req.body)
  const milestone = await one<GenericRow>(
    `SELECT m.status, c.operator_org_id, c.id AS contract_id FROM milestones m JOIN contracts c ON c.id = m.contract_id WHERE m.id = ?`,
    [milestoneId],
  )
  if (!milestone) throw new HttpError(404, 'Milestone not found.', 'milestone_not_found')
  membershipFor(req, String(milestone.operator_org_id), ['owner', 'admin', 'member'])
  if (!['funded', 'in_progress'].includes(String(milestone.status))) throw new HttpError(409, 'Milestone is not ready for delivery.', 'milestone_not_active')
  const id = randomUUID()
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO deliverables (id, milestone_id, submitted_by_user_id, title, description, artifact_url, artifact_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, milestoneId, req.authUser!.id, input.title, input.description, input.artifactUrl ?? null, input.artifactSha256 ?? null],
    )
    await connection.execute(`UPDATE milestones SET status = 'submitted', submitted_at = UTC_TIMESTAMP(3) WHERE id = ?`, [milestoneId])
    await connection.execute(`UPDATE contracts SET status = 'submitted' WHERE id = ?`, [milestone.contract_id])
  })
  res.status(201).json({ deliverable: { id }, milestoneStatus: 'submitted' })
}))

marketplaceRouter.post('/contracts/:contractId/disputes', asyncRoute(async (req, res) => {
  const contractId = uuid.parse(req.params.contractId)
  const input = z.object({ milestoneId: uuid, reason: z.enum(['scope', 'quality', 'deadline', 'unauthorized', 'other']), statement: z.string().trim().min(50).max(10_000) }).parse(req.body)
  const contract = await one<GenericRow>('SELECT client_org_id, operator_org_id FROM contracts WHERE id = ?', [contractId])
  if (!contract) throw new HttpError(404, 'Contract not found.', 'contract_not_found')
  const allowed = req.authUser!.organizations.some((organization) => [contract.client_org_id, contract.operator_org_id].includes(organization.id))
  if (!allowed) throw new HttpError(403, 'Contract access denied.', 'contract_access_denied')
  const milestone = await one<GenericRow>('SELECT id FROM milestones WHERE id = ? AND contract_id = ?', [input.milestoneId, contractId])
  if (!milestone) throw new HttpError(404, 'Milestone not found.', 'milestone_not_found')
  const id = randomUUID()
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO disputes (id, contract_id, milestone_id, opened_by_user_id, reason, statement)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, contractId, input.milestoneId, req.authUser!.id, input.reason, input.statement],
    )
    await connection.execute(`UPDATE contracts SET status = 'disputed' WHERE id = ?`, [contractId])
    await connection.execute(`UPDATE milestones SET status = 'disputed' WHERE id = ?`, [input.milestoneId])
    await connection.execute(`UPDATE payments SET status = 'disputed' WHERE milestone_id = ? AND status IN ('paid','release_pending')`, [input.milestoneId])
  })
  const disputedAgent = await one<GenericRow>('SELECT agent_id FROM contracts WHERE id = ?', [contractId])
  if (disputedAgent) await enqueueAgentWebhook(String(disputedAgent.agent_id), 'contract.disputed', { contractId, milestoneId: input.milestoneId, disputeId: id })
  res.status(201).json({ dispute: { id, status: 'open' } })
}))

marketplaceRouter.post('/contracts/:contractId/reviews', asyncRoute(async (req, res) => {
  const contractId = uuid.parse(req.params.contractId)
  const input = z.object({ rating: z.number().int().min(1).max(5), title: z.string().trim().min(3).max(180), body: z.string().trim().min(20).max(5_000) }).parse(req.body)
  const contract = await one<GenericRow>('SELECT client_org_id, agent_id, status FROM contracts WHERE id = ?', [contractId])
  if (!contract) throw new HttpError(404, 'Contract not found.', 'contract_not_found')
  membershipFor(req, String(contract.client_org_id))
  if (contract.status !== 'completed') throw new HttpError(409, 'Complete the contract before reviewing.', 'contract_not_completed')
  const id = randomUUID()
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO reviews (id, contract_id, reviewer_user_id, agent_id, rating, title, body) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, contractId, req.authUser!.id, contract.agent_id, input.rating, input.title, input.body],
    )
    await connection.execute(
      `UPDATE agents a SET average_rating = (SELECT AVG(r.rating) FROM reviews r WHERE r.agent_id = a.id AND r.status = 'published'),
       review_count = (SELECT COUNT(*) FROM reviews r WHERE r.agent_id = a.id AND r.status = 'published') WHERE a.id = ?`,
      [contract.agent_id],
    )
  })
  res.status(201).json({ review: { id } })
}))

marketplaceRouter.put('/saved-agents/:agentId', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  await execute('INSERT IGNORE INTO saved_agents (user_id, agent_id) VALUES (?, ?)', [req.authUser!.id, agentId])
  res.status(204).end()
}))

marketplaceRouter.delete('/saved-agents/:agentId', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  await execute('DELETE FROM saved_agents WHERE user_id = ? AND agent_id = ?', [req.authUser!.id, agentId])
  res.status(204).end()
}))
