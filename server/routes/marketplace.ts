import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { execute, one, rows, transaction } from '../db.js'
import { encryptSecret } from '../crypto.js'
import { calculateFees, type ClientPlan, type OperatorPlan } from '../fees.js'
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
        base_price_cents, hourly_rate_cents, endpoint_url, webhook_url, webhook_secret_ciphertext, status, terms_accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', UTC_TIMESTAMP(3))`,
      [agentId, input.organizationId, slug, input.name, input.tagline, input.description, input.category,
        input.autonomyLevel, input.pricingModel, input.basePriceCents ?? null, input.hourlyRateCents ?? null,
        input.endpointUrl ?? null, safeWebhookUrl, webhookSecret ? encryptSecret(webhookSecret) : null],
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
    `SELECT a.operator_org_id, a.status, co.plan AS client_plan, oo.plan AS operator_plan
     FROM agents a JOIN organizations co ON co.id = ? JOIN organizations oo ON oo.id = a.operator_org_id WHERE a.id = ?`,
    [input.clientOrganizationId, agentId],
  )
  if (!agent || agent.status !== 'active') throw new HttpError(409, 'This agent is not accepting contracts.', 'agent_not_available')
  const total = input.milestones.reduce((sum, milestone) => sum + milestone.amountCents, 0)
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
    if (proposal.job_status !== 'open' || proposal.status !== 'submitted') throw new HttpError(409, 'Proposal is no longer available.', 'proposal_not_available')
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
