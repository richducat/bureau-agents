import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { execute, one, rows } from '../db.js'
import { acceptManagedRequest, managedService, suggestedManagedAgent } from '../managed.js'
import { assertSafeWebhookUrl } from '../webhooks.js'
import { asyncRoute, authenticateClientAgent, HttpError, requireClientAgentScope } from '../security.js'

type GenericRow = RowDataPacket
const uuid = z.string().uuid()

export const clientApiRouter = Router()
clientApiRouter.use(authenticateClientAgent)

clientApiRouter.get('/me', (req, res) => {
  res.json({ clientAgent: req.authClientAgent })
})

clientApiRouter.get('/agents', requireClientAgentScope('agents:read'), asyncRoute(async (req, res) => {
  const query = z.object({ category: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(50).default(24) }).parse(req.query)
  const values: unknown[] = []
  const conditions = [`a.status = 'active'`]
  if (query.category) { conditions.push('a.category = ?'); values.push(query.category) }
  values.push(query.limit)
  const agents = await rows<GenericRow>(
    `SELECT a.id, a.slug, a.name, a.tagline, a.description, a.category, a.verification_level,
      a.autonomy_level, a.pricing_model, a.base_price_cents, a.hourly_rate_cents, o.name AS operator_name
     FROM agents a JOIN organizations o ON o.id = a.operator_org_id
     WHERE ${conditions.join(' AND ')} ORDER BY (o.kind = 'platform') DESC, a.verification_level DESC, a.created_at ASC LIMIT ?`,
    values,
  )
  res.json({ agents })
}))

clientApiRouter.post('/task-requests', requireClientAgentScope('tasks:write'), asyncRoute(async (req, res) => {
  const input = z.object({
    serviceId: z.string().trim().min(2).max(80),
    title: z.string().trim().min(8).max(220),
    details: z.string().trim().min(80).max(20_000),
    budgetRange: z.enum(['not-sure', 'under-250', '250-500', '500-1000', '1000-2500', '2500-plus']).default('not-sure'),
    desiredTiming: z.enum(['As soon as possible', 'Within 48 hours', 'Within one week', 'Within one month', 'Flexible']).default('Flexible'),
    externalReference: z.string().trim().min(1).max(180).optional(),
    callbackUrl: z.string().url().max(2048).optional(),
  }).parse(req.body)
  const service = managedService(input.serviceId)
  const agent = service ? await suggestedManagedAgent(input.serviceId) : null
  const callbackUrl = input.callbackUrl ? await assertSafeWebhookUrl(input.callbackUrl) : null
  const id = randomUUID()
  try {
    await execute(
      `INSERT INTO task_requests
       (id, user_id, client_org_id, contact_name, business_name, email, service_id, title, details, budget_range,
        desired_timing, source, requester_type, hiring_mode, assigned_agent_id, quote_work_value_cents, quote_summary,
        external_reference, callback_url, status, consent_at, quoted_at)
       VALUES (?, ?, ?, 'Authorized client agent', ?, ?, ?, ?, ?, ?, ?, 'client-agent-api', 'agent', 'managed', ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?)`,
      [id, req.authClientAgent!.createdByUserId, req.authClientAgent!.organizationId, req.authClientAgent!.organizationName,
        req.authClientAgent!.email, input.serviceId, input.title, input.details, input.budgetRange, input.desiredTiming,
        agent?.id ?? null, service?.startingPriceCents ?? null,
        service ? `${service.deliverables.join(', ')}. Typical delivery: ${service.turnaround}.` : null,
        input.externalReference ?? null, callbackUrl, service && agent ? 'quoted' : 'new', service && agent ? new Date() : null],
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That external reference already exists for this client.', 'external_reference_exists')
    throw error
  }
  res.status(201).json({
    request: { id, status: service && agent ? 'quoted' : 'new', externalReference: input.externalReference ?? null },
    match: agent ? { agentId: agent.id, name: agent.name } : null,
    quote: service ? { workValueCents: service.startingPriceCents, turnaround: service.turnaround, deliverables: service.deliverables } : null,
    approvalUrl: `${getConfig().APP_ORIGIN}/start?request=${encodeURIComponent(id)}`,
  })
}))

clientApiRouter.get('/task-requests/:requestId', requireClientAgentScope('tasks:read'), asyncRoute(async (req, res) => {
  const requestId = uuid.parse(req.params.requestId)
  const request = await one<GenericRow>(
    `SELECT tr.id, tr.external_reference, tr.service_id, tr.title, tr.status, tr.quote_work_value_cents,
      tr.quote_summary, tr.contract_id, tr.created_at, tr.updated_at, a.name AS assigned_agent_name
     FROM task_requests tr LEFT JOIN agents a ON a.id = tr.assigned_agent_id
     WHERE tr.id = ? AND tr.client_org_id = ?`,
    [requestId, req.authClientAgent!.organizationId],
  )
  if (!request) throw new HttpError(404, 'Managed request not found.', 'task_request_not_found')
  res.json({ request, approvalUrl: `${getConfig().APP_ORIGIN}/start?request=${encodeURIComponent(requestId)}` })
}))

clientApiRouter.post('/task-requests/:requestId/accept', requireClientAgentScope('tasks:approve'), asyncRoute(async (req, res) => {
  const requestId = uuid.parse(req.params.requestId)
  const organization = await one<GenericRow>('SELECT plan FROM organizations WHERE id = ? AND kind = \'client\'', [req.authClientAgent!.organizationId])
  if (!organization) throw new HttpError(404, 'Client organization not found.', 'organization_not_found')
  const result = await acceptManagedRequest(requestId, req.authClientAgent!.organizationId, req.authClientAgent!.createdByUserId, organization.plan)
  res.status(201).json({
    contract: { id: result.contractId, milestoneId: result.milestoneId, status: 'pending_funding' },
    paymentApprovalUrl: `${getConfig().APP_ORIGIN}/contracts/${encodeURIComponent(result.contractId)}`,
  })
}))
