import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { execute, one, rows, transaction } from '../db.js'
import { asyncRoute, authenticateAgent, HttpError, requireAgentScope } from '../security.js'

type GenericRow = RowDataPacket
const uuid = z.string().uuid()
const money = z.number().int().min(500).max(100_000_000)

export const agentApiRouter = Router()
agentApiRouter.use(authenticateAgent)

agentApiRouter.get('/me', (req, res) => {
  res.json({ agent: req.authAgent })
})

agentApiRouter.post('/heartbeat', requireAgentScope('heartbeat:write'), asyncRoute(async (req, res) => {
  const input = z.object({
    status: z.enum(['online', 'busy', 'degraded', 'offline']),
    activeRuns: z.number().int().min(0).max(100_000).default(0),
    capacity: z.number().int().min(0).max(100_000).default(1),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  }).parse(req.body)
  await execute(
    `INSERT INTO agent_heartbeats (agent_id, status, active_runs, capacity, metadata) VALUES (?, ?, ?, ?, ?)`,
    [req.authAgent!.id, input.status, input.activeRuns, input.capacity, input.metadata ? JSON.stringify(input.metadata) : null],
  )
  res.status(202).json({ accepted: true, recordedAt: new Date().toISOString() })
}))

agentApiRouter.get('/jobs', requireAgentScope('jobs:read'), asyncRoute(async (req, res) => {
  const query = z.object({
    category: z.string().trim().max(80).optional(),
    minBudgetCents: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().datetime().optional(),
  }).parse(req.query)
  const conditions = [`j.status = 'open'`, `j.visibility = 'public'`, `NOT EXISTS (SELECT 1 FROM proposals p WHERE p.job_id = j.id AND p.agent_id = ?)`]
  const values: unknown[] = [req.authAgent!.id]
  if (query.category) { conditions.push('j.category = ?'); values.push(query.category) }
  if (query.minBudgetCents !== undefined) { conditions.push('j.budget_max_cents >= ?'); values.push(query.minBudgetCents) }
  if (query.cursor) { conditions.push('j.published_at < ?'); values.push(new Date(query.cursor)) }
  values.push(query.limit)
  const jobs = await rows<GenericRow>(
    `SELECT j.id, j.slug, j.title, j.summary, j.description, j.category, j.deliverables,
      j.required_capabilities, j.autonomy_level, j.budget_min_cents, j.budget_max_cents,
      j.currency, j.deadline_at, j.published_at, o.name AS client_name
     FROM jobs j JOIN organizations o ON o.id = j.client_org_id
     WHERE ${conditions.join(' AND ')} ORDER BY j.published_at DESC LIMIT ?`,
    values,
  )
  res.json({ jobs, nextCursor: jobs.length === query.limit ? jobs.at(-1)?.published_at : null })
}))

agentApiRouter.post('/jobs/:jobId/proposals', requireAgentScope('proposals:write'), asyncRoute(async (req, res) => {
  const jobId = uuid.parse(req.params.jobId)
  const input = z.object({
    amountCents: money,
    durationDays: z.number().int().min(1).max(365),
    approach: z.string().trim().min(100).max(10_000),
    milestones: z.array(z.object({
      title: z.string().trim().min(3).max(180),
      description: z.string().trim().min(10).max(2_000),
      amountCents: money,
      dueInDays: z.number().int().min(1).max(365),
    })).min(1).max(20),
  }).parse(req.body)
  if (input.milestones.reduce((sum, milestone) => sum + milestone.amountCents, 0) !== input.amountCents) {
    throw new HttpError(400, 'Milestone amounts must equal the proposal total.', 'milestone_total_mismatch')
  }
  const job = await one<GenericRow>('SELECT status FROM jobs WHERE id = ?', [jobId])
  if (!job || job.status !== 'open') throw new HttpError(409, 'This job is not accepting proposals.', 'job_not_open')
  const id = randomUUID()
  try {
    await execute(
      `INSERT INTO proposals (id, job_id, agent_id, amount_cents, duration_days, approach, milestones)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, jobId, req.authAgent!.id, input.amountCents, input.durationDays, input.approach, JSON.stringify(input.milestones)],
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new HttpError(409, 'This agent already submitted a proposal.', 'proposal_exists')
    throw error
  }
  res.status(201).json({ proposal: { id, status: 'submitted' } })
}))

agentApiRouter.get('/contracts', requireAgentScope('messages:read'), asyncRoute(async (req, res) => {
  const contracts = await rows<GenericRow>(
    `SELECT c.*, o.name AS client_name,
      (SELECT COUNT(*) FROM milestones m WHERE m.contract_id = c.id AND m.status IN ('funded','in_progress','submitted')) AS actionable_milestones
     FROM contracts c JOIN organizations o ON o.id = c.client_org_id
     WHERE c.agent_id = ? AND c.status NOT IN ('cancelled') ORDER BY c.updated_at DESC LIMIT 100`,
    [req.authAgent!.id],
  )
  res.json({ contracts })
}))

agentApiRouter.get('/contracts/:contractId/messages', requireAgentScope('messages:read'), asyncRoute(async (req, res) => {
  const contractId = uuid.parse(req.params.contractId)
  const contract = await one<GenericRow>('SELECT id FROM contracts WHERE id = ? AND agent_id = ?', [contractId, req.authAgent!.id])
  if (!contract) throw new HttpError(404, 'Contract not found.', 'contract_not_found')
  const query = z.object({ after: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query)
  const messages = await rows<GenericRow>(
    `SELECT m.id, m.body, m.metadata, m.created_at, u.display_name AS sender_user_name, a.name AS sender_agent_name
     FROM messages m LEFT JOIN users u ON u.id = m.sender_user_id LEFT JOIN agents a ON a.id = m.sender_agent_id
     WHERE m.contract_id = ? AND m.created_at > ? ORDER BY m.created_at ASC LIMIT ?`,
    [contractId, query.after ? new Date(query.after) : new Date(0), query.limit],
  )
  res.json({ messages })
}))

agentApiRouter.post('/contracts/:contractId/messages', requireAgentScope('messages:write'), asyncRoute(async (req, res) => {
  const contractId = uuid.parse(req.params.contractId)
  const input = z.object({
    body: z.string().trim().min(1).max(10_000),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  }).parse(req.body)
  const contract = await one<GenericRow>('SELECT id FROM contracts WHERE id = ? AND agent_id = ?', [contractId, req.authAgent!.id])
  if (!contract) throw new HttpError(404, 'Contract not found.', 'contract_not_found')
  const id = randomUUID()
  await execute(
    `INSERT INTO messages (id, contract_id, sender_agent_id, body, metadata) VALUES (?, ?, ?, ?, ?)`,
    [id, contractId, req.authAgent!.id, input.body, input.metadata ? JSON.stringify(input.metadata) : null],
  )
  res.status(201).json({ message: { id, createdAt: new Date().toISOString() } })
}))

agentApiRouter.post('/milestones/:milestoneId/deliverables', requireAgentScope('deliverables:write'), asyncRoute(async (req, res) => {
  const milestoneId = uuid.parse(req.params.milestoneId)
  const input = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(10_000),
    artifactUrl: z.string().url().max(2048).nullable().optional(),
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  }).parse(req.body)
  const milestone = await one<GenericRow>(
    `SELECT m.status, m.contract_id FROM milestones m JOIN contracts c ON c.id = m.contract_id
     WHERE m.id = ? AND c.agent_id = ?`,
    [milestoneId, req.authAgent!.id],
  )
  if (!milestone) throw new HttpError(404, 'Milestone not found.', 'milestone_not_found')
  if (!['funded', 'in_progress'].includes(String(milestone.status))) throw new HttpError(409, 'Milestone is not ready for delivery.', 'milestone_not_active')
  const id = randomUUID()
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO deliverables
       (id, milestone_id, submitted_by_agent_id, title, description, artifact_url, artifact_sha256, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, milestoneId, req.authAgent!.id, input.title, input.description, input.artifactUrl ?? null,
        input.artifactSha256 ?? null, input.metadata ? JSON.stringify(input.metadata) : null],
    )
    await connection.execute(`UPDATE milestones SET status = 'submitted', submitted_at = UTC_TIMESTAMP(3) WHERE id = ?`, [milestoneId])
    await connection.execute(`UPDATE contracts SET status = 'submitted' WHERE id = ?`, [milestone.contract_id])
  })
  res.status(201).json({ deliverable: { id }, milestoneStatus: 'submitted' })
}))
