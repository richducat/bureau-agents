import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { execute, one, rows, transaction } from '../db.js'
import { asyncRoute, HttpError, requireAuth, requirePlatformRole, requireVerifiedEmail } from '../security.js'
import { stripeClient } from '../stripe.js'

type GenericRow = RowDataPacket
const uuid = z.string().uuid()

export const adminRouter = Router()
adminRouter.use(requireAuth, requireVerifiedEmail, requirePlatformRole('admin', 'support'))

adminRouter.get('/metrics', asyncRoute(async (_req, res) => {
  const [financial, funnel, supply, operations] = await Promise.all([
    one<GenericRow>(
      `SELECT COALESCE(SUM(work_value_cents),0) AS gmv_cents,
        COALESCE(SUM(bureau_gross_cents),0) AS bureau_gross_cents,
        COALESCE(SUM(processor_fee_cents),0) AS processor_fees_cents,
        COALESCE(SUM(CASE WHEN status = 'released' THEN operator_net_cents ELSE 0 END),0) AS operator_payouts_cents,
        COUNT(*) AS payment_count
       FROM payments WHERE status IN ('paid','release_pending','released','refunded','disputed')`,
    ),
    one<GenericRow>(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE status IN ('pending','active')) AS users,
        (SELECT COUNT(*) FROM jobs WHERE status = 'open') AS open_jobs,
        (SELECT COUNT(*) FROM task_requests WHERE status IN ('new','reviewing','quoted')) AS active_task_requests,
        (SELECT COUNT(*) FROM proposals WHERE status = 'submitted') AS proposals,
        (SELECT COUNT(*) FROM contracts WHERE status NOT IN ('cancelled')) AS contracts,
        (SELECT COUNT(*) FROM subscriptions WHERE status IN ('active','trialing')) AS paid_subscriptions`,
    ),
    one<GenericRow>(
      `SELECT
        (SELECT COUNT(*) FROM agents WHERE status = 'active') AS live_agents,
        (SELECT COUNT(*) FROM agents WHERE status = 'review') AS agents_in_review,
        (SELECT COUNT(DISTINCT agent_id) FROM agent_heartbeats WHERE recorded_at > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE) AND status IN ('online','busy')) AS online_agents`,
    ),
    one<GenericRow>(
      `SELECT
        (SELECT COUNT(*) FROM disputes WHERE status IN ('open','evidence')) AS open_disputes,
        (SELECT COUNT(*) FROM webhook_events WHERE status = 'failed') AS failed_webhooks,
        (SELECT COUNT(*) FROM payments WHERE status = 'release_pending') AS pending_releases`,
    ),
  ])
  res.json({ financial, funnel, supply, operations, generatedAt: new Date().toISOString() })
}))

adminRouter.get('/agents/review', asyncRoute(async (_req, res) => {
  const agents = await rows<GenericRow>(
    `SELECT a.*, o.name AS operator_name, o.stripe_onboarding_complete, o.stripe_payouts_enabled,
      (SELECT JSON_ARRAYAGG(capability) FROM agent_capabilities WHERE agent_id = a.id) AS capabilities
     FROM agents a JOIN organizations o ON o.id = a.operator_org_id WHERE a.status = 'review' ORDER BY a.created_at ASC`,
  )
  res.json({ agents })
}))

adminRouter.post('/agents/:agentId/decision', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  const input = z.object({
    decision: z.enum(['approve', 'reject', 'request_changes']),
    verificationLevel: z.enum(['unverified', 'identity', 'capability', 'production']).default('unverified'),
    note: z.string().trim().min(10).max(2_000),
  }).parse(req.body)
  const status = input.decision === 'approve' ? 'active' : input.decision === 'reject' ? 'rejected' : 'draft'
  const result = await execute(
    `UPDATE agents SET status = ?, verification_level = ?, published_at = IF(? = 'active', COALESCE(published_at, UTC_TIMESTAMP(3)), published_at) WHERE id = ?`,
    [status, input.verificationLevel, status, agentId],
  )
  if (!result.affectedRows) throw new HttpError(404, 'Agent not found.', 'agent_not_found')
  await execute(
    `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, metadata) VALUES (?, ?, 'agent', ?, ?)`,
    [req.authUser!.id, `agent.${input.decision}`, agentId, JSON.stringify({ note: input.note, verificationLevel: input.verificationLevel })],
  )
  res.json({ agent: { id: agentId, status, verificationLevel: input.verificationLevel } })
}))

adminRouter.get('/disputes', asyncRoute(async (req, res) => {
  const status = z.enum(['open','evidence','resolved_client','resolved_operator','split','closed']).optional().parse(req.query.status)
  const disputes = await rows<GenericRow>(
    `SELECT d.*, c.title AS contract_title, m.title AS milestone_title, p.work_value_cents, p.client_total_cents,
      p.operator_net_cents, p.status AS payment_status, p.stripe_charge_id, p.stripe_transfer_id,
      co.name AS client_name, oo.name AS operator_name
     FROM disputes d JOIN contracts c ON c.id = d.contract_id JOIN milestones m ON m.id = d.milestone_id
     LEFT JOIN payments p ON p.milestone_id = m.id AND p.status <> 'failed'
     JOIN organizations co ON co.id = c.client_org_id JOIN organizations oo ON oo.id = c.operator_org_id
     WHERE (? IS NULL OR d.status = ?) ORDER BY d.created_at ASC`,
    [status ?? null, status ?? null],
  )
  res.json({ disputes })
}))

adminRouter.post('/disputes/:disputeId/resolve', requirePlatformRole('admin'), asyncRoute(async (req, res) => {
  const disputeId = uuid.parse(req.params.disputeId)
  const input = z.object({
    resolution: z.enum(['client_refund', 'operator_release', 'split']),
    operatorShareCents: z.number().int().min(0).optional(),
    note: z.string().trim().min(50).max(10_000),
  }).parse(req.body)
  const dispute = await one<GenericRow>(
    `SELECT d.*, p.id AS payment_id, p.stripe_charge_id, p.stripe_transfer_id, p.client_total_cents,
      p.operator_net_cents, p.status AS payment_status, c.operator_org_id, o.stripe_account_id
     FROM disputes d JOIN contracts c ON c.id = d.contract_id JOIN payments p ON p.milestone_id = d.milestone_id
     JOIN organizations o ON o.id = c.operator_org_id
     WHERE d.id = ? AND d.status IN ('open','evidence') ORDER BY p.created_at DESC LIMIT 1`,
    [disputeId],
  )
  if (!dispute) throw new HttpError(404, 'Open dispute not found.', 'dispute_not_found')
  if (!dispute.stripe_charge_id) throw new HttpError(409, 'Payment charge is not available.', 'payment_not_ready')

  let transferId = dispute.stripe_transfer_id ? String(dispute.stripe_transfer_id) : null
  let refundId: string | null = null
  let status: string
  if (input.resolution === 'client_refund') {
    if (transferId) await stripeClient().transfers.createReversal(transferId, {}, { idempotencyKey: `dispute_reverse_${disputeId}` })
    const refund = await stripeClient().refunds.create({ charge: String(dispute.stripe_charge_id), metadata: { bureau_dispute_id: disputeId } }, { idempotencyKey: `dispute_refund_${disputeId}` })
    refundId = refund.id
    status = 'resolved_client'
  } else {
    const operatorShare = input.resolution === 'operator_release'
      ? Number(dispute.operator_net_cents)
      : input.operatorShareCents
    if (operatorShare === undefined || operatorShare < 0 || operatorShare > Number(dispute.operator_net_cents)) {
      throw new HttpError(400, 'Operator share must be between zero and the original operator net.', 'invalid_split')
    }
    if (!dispute.stripe_account_id) throw new HttpError(409, 'Operator payout account is missing.', 'payout_not_ready')
    if (!transferId && operatorShare > 0) {
      const transfer = await stripeClient().transfers.create({
        amount: operatorShare,
        currency: 'usd',
        destination: String(dispute.stripe_account_id),
        source_transaction: String(dispute.stripe_charge_id),
        transfer_group: `bureau_contract_${dispute.contract_id}`,
        metadata: { bureau_dispute_id: disputeId, bureau_payment_id: String(dispute.payment_id) },
      }, { idempotencyKey: `dispute_transfer_${disputeId}` })
      transferId = transfer.id
    }
    const clientRefundCents = Number(dispute.operator_net_cents) - operatorShare
    if (clientRefundCents > 0) {
      const refund = await stripeClient().refunds.create({
        charge: String(dispute.stripe_charge_id),
        amount: clientRefundCents,
        metadata: { bureau_dispute_id: disputeId },
      }, { idempotencyKey: `dispute_split_refund_${disputeId}` })
      refundId = refund.id
    }
    status = input.resolution === 'operator_release' ? 'resolved_operator' : 'split'
  }

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE disputes SET status = ?, resolution_note = ?, resolved_by_user_id = ?, resolved_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [status, input.note, req.authUser!.id, disputeId],
    )
    await connection.execute(
      `UPDATE payments SET status = ?, stripe_transfer_id = COALESCE(stripe_transfer_id, ?), refunded_at = IF(? IS NOT NULL, UTC_TIMESTAMP(3), refunded_at) WHERE id = ?`,
      [status === 'resolved_client' ? 'refunded' : 'released', transferId, refundId, dispute.payment_id],
    )
    await connection.execute(`UPDATE milestones SET status = ? WHERE id = ?`, [status === 'resolved_client' ? 'refunded' : 'released', dispute.milestone_id])
    await connection.execute(`UPDATE contracts SET status = 'active' WHERE id = ?`, [dispute.contract_id])
    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, metadata) VALUES (?, 'dispute.resolved', 'dispute', ?, ?)`,
      [req.authUser!.id, disputeId, JSON.stringify({ resolution: input.resolution, transferId, refundId })],
    )
  })
  res.json({ dispute: { id: disputeId, status }, transferId, refundId })
}))

adminRouter.get('/revenue-ledger', asyncRoute(async (req, res) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).max(100_000).default(0) }).parse(req.query)
  const payments = await rows<GenericRow>(
    `SELECT p.*, c.title AS contract_title, m.title AS milestone_title, co.name AS client_name, oo.name AS operator_name,
      (p.bureau_gross_cents - COALESCE(p.processor_fee_cents, 0)) AS contribution_before_connect_cents
     FROM payments p JOIN milestones m ON m.id = p.milestone_id JOIN contracts c ON c.id = m.contract_id
     JOIN organizations co ON co.id = p.client_org_id JOIN organizations oo ON oo.id = p.operator_org_id
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [query.limit, query.offset],
  )
  res.json({ payments, pagination: query })
}))

adminRouter.get('/waitlist', asyncRoute(async (_req, res) => {
  const leads = await rows<GenericRow>('SELECT email, audience, source, consent_at, created_at FROM waitlist_leads ORDER BY created_at DESC LIMIT 5000')
  res.json({ leads })
}))

adminRouter.get('/task-requests', asyncRoute(async (req, res) => {
  const status = z.enum(['new','reviewing','quoted','accepted','declined','completed']).optional().parse(req.query.status)
  const requests = await rows<GenericRow>(
    `SELECT id, contact_name, business_name, email, service_id, title, details, budget_range, desired_timing, source, status, admin_note, created_at, updated_at
     FROM task_requests WHERE (? IS NULL OR status = ?) ORDER BY FIELD(status, 'new','reviewing','quoted','accepted','completed','declined'), created_at DESC LIMIT 1000`,
    [status ?? null, status ?? null],
  )
  res.json({ requests })
}))

adminRouter.patch('/task-requests/:requestId', asyncRoute(async (req, res) => {
  const requestId = uuid.parse(req.params.requestId)
  const input = z.object({
    status: z.enum(['new','reviewing','quoted','accepted','declined','completed']),
    adminNote: z.string().trim().max(10_000).optional().default(''),
  }).parse(req.body)
  const result = await execute(
    'UPDATE task_requests SET status = ?, admin_note = ? WHERE id = ?',
    [input.status, input.adminNote || null, requestId],
  )
  if (!result.affectedRows) throw new HttpError(404, 'Task request not found.', 'task_request_not_found')
  await execute(
    `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, metadata) VALUES (?, 'task_request.updated', 'task_request', ?, ?)`,
    [req.authUser!.id, requestId, JSON.stringify({ status: input.status })],
  )
  res.json({ request: { id: requestId, status: input.status } })
}))
