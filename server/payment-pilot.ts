import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { getConfig } from './config.js'
import { HttpError } from './security.js'
import { evaluatePilotReservation, type PilotCaps, type PilotUsage } from './payment-pilot-policy.js'

interface PilotUsageRow extends RowDataPacket {
  daily_customer_charges_cents: string | number
  lifetime_customer_charges_cents: string | number
  lifetime_payment_count: string | number
  observed_processor_fees_cents: string | number
  observed_additional_fees_cents: string | number
}

export function configuredPilotCaps(): PilotCaps {
  const config = getConfig()
  return {
    transactionCents: config.PILOT_TRANSACTION_CAP_CENTS,
    dailyCustomerChargesCents: config.PILOT_DAILY_CHARGE_CAP_CENTS,
    lifetimeCustomerChargesCents: config.PILOT_LIFETIME_CHARGE_CAP_CENTS,
    lifetimeExposureCents: config.PILOT_LIFETIME_EXPOSURE_CAP_CENTS,
  }
}

export async function lockAndReadPilotUsage(connection: PoolConnection): Promise<PilotUsage> {
  await connection.execute('SELECT id FROM payment_pilot_control WHERE id = 1 FOR UPDATE')
  const [records] = await connection.execute<PilotUsageRow[]>(
    `SELECT
       COALESCE(SUM(CASE
         WHEN paid_at IS NOT NULL OR status IN ('created','checkout_open') THEN client_total_cents
         ELSE 0 END), 0) AS lifetime_customer_charges_cents,
       COALESCE(SUM(CASE
         WHEN (paid_at >= UTC_DATE() AND paid_at < DATE_ADD(UTC_DATE(), INTERVAL 1 DAY))
           OR status IN ('created','checkout_open') THEN client_total_cents
         ELSE 0 END), 0) AS daily_customer_charges_cents,
       COALESCE(SUM(CASE
         WHEN paid_at IS NOT NULL OR status IN ('created','checkout_open') THEN 1
         ELSE 0 END), 0) AS lifetime_payment_count,
       COALESCE(SUM(processor_fee_cents), 0) AS observed_processor_fees_cents,
       COALESCE((SELECT SUM(amount_cents) FROM payment_stripe_exposure_events WHERE event_kind = 'additional_fee'), 0)
         AS observed_additional_fees_cents
     FROM payments`,
  )
  const usage = records[0]
  return {
    dailyCustomerChargesCents: Number(usage?.daily_customer_charges_cents ?? 0),
    lifetimeCustomerChargesCents: Number(usage?.lifetime_customer_charges_cents ?? 0),
    lifetimePaymentCount: Number(usage?.lifetime_payment_count ?? 0),
    observedStripeFeesCents: Number(usage?.observed_processor_fees_cents ?? 0) + Number(usage?.observed_additional_fees_cents ?? 0),
  }
}

export function assertPilotReservation(usage: PilotUsage, proposedCustomerChargeCents: number) {
  const decision = evaluatePilotReservation(usage, proposedCustomerChargeCents, configuredPilotCaps())
  if (decision.allowed) return decision
  const messages = {
    pilot_transaction_cap_exceeded: 'This milestone exceeds the Bureau pilot maximum of $500 including the client fee. Split the work into smaller milestones.',
    pilot_daily_cap_reached: 'The Bureau pilot has reached its $1,000 daily customer-charge limit. No additional checkout can be opened today.',
    pilot_lifetime_cap_reached: 'The Bureau pilot has reached its $5,000 lifetime customer-charge limit. New funding is paused.',
    pilot_exposure_cap_reached: 'The Bureau pilot has reached its approved lifetime Stripe exposure limit. New funding is paused.',
  } as const
  throw new HttpError(409, messages[decision.code], decision.code)
}
