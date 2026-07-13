import { randomUUID } from 'node:crypto'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { one, transaction } from './db.js'
import { calculateFees, type ClientPlan } from './fees.js'
import { HttpError } from './security.js'

type GenericRow = RowDataPacket

export interface ManagedServiceDefinition {
  id: string
  category: string
  startingPriceCents: number
  turnaround: string
  deliverables: string[]
}

export const MANAGED_SERVICES: Record<string, ManagedServiceDefinition> = {
  'market-research': { id: 'market-research', category: 'Research', startingPriceCents: 39_000, turnaround: '24–48 hours', deliverables: ['Executive brief', 'Source-linked findings', 'Structured comparison'] },
  'spreadsheet-cleanup': { id: 'spreadsheet-cleanup', category: 'Data', startingPriceCents: 21_000, turnaround: '1–2 days', deliverables: ['Clean export', 'Exceptions sheet', 'Quality summary'] },
  'website-fix': { id: 'website-fix', category: 'Engineering', startingPriceCents: 28_000, turnaround: '1–3 days', deliverables: ['Root-cause summary', 'Tested change', 'Deployment notes'] },
  'support-backlog': { id: 'support-backlog', category: 'Customer support', startingPriceCents: 29_000, turnaround: '1–2 days', deliverables: ['Triage queue', 'Resolved or drafted replies', 'Escalation report'] },
  'content-brief': { id: 'content-brief', category: 'Marketing', startingPriceCents: 24_000, turnaround: '2 days', deliverables: ['Search brief', 'Source record', 'Outline and metadata'] },
  'invoice-review': { id: 'invoice-review', category: 'Finance', startingPriceCents: 32_500, turnaround: '1–2 days', deliverables: ['Exception queue', 'Evidence workbook', 'Findings summary'] },
}

export function managedService(serviceId: string) {
  return MANAGED_SERVICES[serviceId] ?? null
}

export async function suggestedManagedAgent(serviceId: string) {
  const service = managedService(serviceId)
  if (!service) return null
  return one<GenericRow>(
    `SELECT a.id, a.name, a.operator_org_id, o.plan AS operator_plan
     FROM agents a JOIN organizations o ON o.id = a.operator_org_id
     WHERE a.status = 'active' AND a.category = ?
     ORDER BY (o.kind = 'platform') DESC, a.verification_level DESC, a.completed_contracts DESC, a.created_at ASC LIMIT 1`,
    [service.category],
  )
}

async function createContract(connection: PoolConnection, request: GenericRow, clientOrgId: string, actorUserId: string, clientPlan: ClientPlan) {
  if (!request.assigned_agent_id || !request.quote_work_value_cents) throw new HttpError(409, 'This request is not ready for approval.', 'quote_not_ready')
  const agent = await one<GenericRow>(
    `SELECT a.id, a.operator_org_id, a.status, o.plan AS operator_plan FROM agents a
     JOIN organizations o ON o.id = a.operator_org_id WHERE a.id = ?`,
    [request.assigned_agent_id],
  )
  if (!agent || agent.status !== 'active') throw new HttpError(409, 'The assigned Bureau agent is not currently available.', 'agent_not_available')
  const workValueCents = Number(request.quote_work_value_cents)
  const fees = calculateFees(workValueCents, clientPlan, agent.operator_plan)
  const contractId = randomUUID()
  const milestoneId = randomUUID()
  await connection.execute(
    `INSERT INTO contracts
     (id, client_org_id, operator_org_id, agent_id, title, scope, total_work_value_cents, client_fee_basis_points, operator_fee_basis_points)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contractId, clientOrgId, agent.operator_org_id, agent.id, request.title, request.details, workValueCents, fees.clientFeeBasisPoints, fees.operatorFeeBasisPoints],
  )
  await connection.execute(
    `INSERT INTO milestones (id, contract_id, sequence_number, title, description, work_value_cents, due_at)
     VALUES (?, ?, 1, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY))`,
    [milestoneId, contractId, 'Complete managed delivery', request.quote_summary || 'Deliver the approved scope with relevant evidence and a completion record.', workValueCents],
  )
  await connection.execute(
    `UPDATE task_requests SET contract_id = ?, client_org_id = ?, user_id = COALESCE(user_id, ?), status = 'payment_ready', accepted_at = UTC_TIMESTAMP(3)
     WHERE id = ?`,
    [contractId, clientOrgId, actorUserId, request.id],
  )
  await connection.execute(
    `INSERT INTO audit_log (actor_user_id, organization_id, action, target_type, target_id, metadata)
     VALUES (?, ?, 'managed_request.accepted', 'task_request', ?, ?)`,
    [actorUserId, clientOrgId, request.id, JSON.stringify({ contractId, milestoneId, assignedAgentId: agent.id })],
  )
  return { contractId, milestoneId, fees }
}

export async function acceptManagedRequest(requestId: string, clientOrgId: string, actorUserId: string, clientPlan: ClientPlan) {
  return transaction(async (connection) => {
    const [records] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM task_requests WHERE id = ? FOR UPDATE`,
      [requestId],
    )
    const request = records[0] as GenericRow | undefined
    if (!request) throw new HttpError(404, 'Managed request not found.', 'task_request_not_found')
    if (request.client_org_id && request.client_org_id !== clientOrgId) throw new HttpError(403, 'This request belongs to another organization.', 'organization_access_denied')
    if (request.contract_id) {
      const [milestones] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM milestones WHERE contract_id = ? ORDER BY sequence_number ASC LIMIT 1',
        [request.contract_id],
      )
      return { contractId: String(request.contract_id), milestoneId: String(milestones[0]?.id), fees: null, reused: true }
    }
    return createContract(connection, request, clientOrgId, actorUserId, clientPlan)
  })
}
