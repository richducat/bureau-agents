import { randomUUID } from 'node:crypto'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { execute, one, transaction } from './db.js'
import { calculateFees, type ClientPlan } from './fees.js'
import { MANAGED_CATALOG, type ManagedCatalogDefinition } from './managed-catalog.js'
import { getConfig } from './config.js'
import { splitWorkValueForPilot } from './payment-pilot-policy.js'
import { HttpError } from './security.js'

type GenericRow = RowDataPacket

export type ManagedServiceDefinition = ManagedCatalogDefinition

export const MANAGED_SERVICES: Record<string, ManagedServiceDefinition> = MANAGED_CATALOG

export function managedService(serviceId: string) {
  return MANAGED_SERVICES[serviceId] ?? null
}

export async function suggestedManagedAgent(serviceId: string) {
  const service = managedService(serviceId)
  if (!service) return null
  return one<GenericRow>(
    `SELECT a.id, a.slug, a.name, a.category, a.verification_level, a.response_time_minutes,
      a.operator_org_id, o.plan AS operator_plan
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
  const milestoneValues = splitWorkValueForPilot(workValueCents, fees.clientFeeBasisPoints, getConfig().PILOT_TRANSACTION_CAP_CENTS)
  const milestoneIds = milestoneValues.map(() => randomUUID())
  const contractScope = request.quote_basis === 'catalog' && request.quote_summary
    ? `${request.quote_summary}\n\nBuyer-provided context (does not expand the package inclusions, quantity, or automatic quote):\n${request.details}`
    : String(request.details)
  await connection.execute(
    `INSERT INTO contracts
     (id, client_org_id, operator_org_id, agent_id, title, scope, total_work_value_cents, client_fee_basis_points, operator_fee_basis_points)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contractId, clientOrgId, agent.operator_org_id, agent.id, request.title, contractScope, workValueCents, fees.clientFeeBasisPoints, fees.operatorFeeBasisPoints],
  )
  for (const [index, milestoneValueCents] of milestoneValues.entries()) {
    const partLabel = milestoneValues.length > 1 ? ` — part ${index + 1} of ${milestoneValues.length}` : ''
    await connection.execute(
      `INSERT INTO milestones (id, contract_id, sequence_number, title, description, work_value_cents, due_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY))`,
      [milestoneIds[index], contractId, index + 1, `Complete managed delivery${partLabel}`,
        request.quote_summary || 'Deliver the approved scope with relevant evidence and a completion record.', milestoneValueCents],
    )
  }
  await connection.execute(
    `UPDATE task_requests SET contract_id = ?, client_org_id = ?, user_id = COALESCE(user_id, ?), status = 'payment_ready', accepted_at = UTC_TIMESTAMP(3)
     WHERE id = ?`,
    [contractId, clientOrgId, actorUserId, request.id],
  )
  await connection.execute(
    `INSERT INTO audit_log (actor_user_id, organization_id, action, target_type, target_id, metadata)
     VALUES (?, ?, 'managed_request.accepted', 'task_request', ?, ?)`,
    [actorUserId, clientOrgId, request.id, JSON.stringify({ contractId, milestoneIds, assignedAgentId: agent.id })],
  )
  return { contractId, milestoneId: milestoneIds[0], milestoneIds, fees }
}

export async function acceptManagedRequest(requestId: string, clientOrgId: string, actorUserId: string, clientPlan: ClientPlan) {
  const expired = await one<GenericRow>(
    `SELECT id FROM task_requests WHERE id = ? AND contract_id IS NULL AND guarantee_status = 'eligible'
      AND guarantee_expires_at IS NOT NULL AND guarantee_expires_at < UTC_TIMESTAMP(3)`,
    [requestId],
  )
  if (expired) {
    await execute(
      `UPDATE task_requests SET guarantee_status = 'expired', status = 'reviewing', quote_work_value_cents = NULL
       WHERE id = ? AND guarantee_status = 'eligible'`,
      [requestId],
    )
    throw new HttpError(409, 'This verified external quote has expired. Bureau must reverify its source and price before payment.', 'quote_expired')
  }
  return transaction(async (connection) => {
    const [records] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM task_requests WHERE id = ? FOR UPDATE`,
      [requestId],
    )
    const request = records[0] as GenericRow | undefined
    if (!request) throw new HttpError(404, 'Managed request not found.', 'task_request_not_found')
    if (request.client_org_id && request.client_org_id !== clientOrgId) throw new HttpError(403, 'This request belongs to another organization.', 'organization_access_denied')
    if (!request.contract_id && request.source_platform === 'upwork' && request.source_verification_status === 'legacy_unverified') {
      throw new HttpError(409, 'This older quote used an unverified client-entered comparison amount and cannot be paid. Submit a fresh job-reference request for an automatic bounded catalog quote.', 'legacy_quote_repricing_required')
    }
    if (!request.contract_id && request.quote_basis === 'verified_external_reference' && request.source_verification_status !== 'verified') {
      throw new HttpError(409, 'This external-comparison quote is not backed by an authorized verified source and cannot be paid.', 'quote_source_not_verified')
    }
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
