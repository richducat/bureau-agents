export const APPROVED_MILESTONE_PILOT_CAPS = Object.freeze({
  transactionCents: 50_000,
  dailyCustomerChargesCents: 100_000,
  lifetimeCustomerChargesCents: 500_000,
  lifetimeExposureCents: 800_000,
  currency: 'usd' as const,
})

// Every open or completed payment permanently reserves this much of the
// exposure budget for Stripe processing, Connect, refund, dispute, and
// chargeback overhead. Customer principal is reserved separately and is never
// released from the lifetime calculation after a refund or dispute.
export const PILOT_STRIPE_OVERHEAD_RESERVE_CENTS_PER_PAYMENT = 30_000

export type PilotCaps = {
  transactionCents: number
  dailyCustomerChargesCents: number
  lifetimeCustomerChargesCents: number
  lifetimeExposureCents: number
}

export type PilotUsage = {
  dailyCustomerChargesCents: number
  lifetimeCustomerChargesCents: number
  lifetimePaymentCount: number
  observedStripeFeesCents: number
}

export type PilotReservationDecision =
  | {
      allowed: true
      projectedDailyCustomerChargesCents: number
      projectedLifetimeCustomerChargesCents: number
      projectedLifetimeExposureCents: number
      projectedLifetimePaymentCount: number
    }
  | {
      allowed: false
      code: 'pilot_transaction_cap_exceeded' | 'pilot_daily_cap_reached' | 'pilot_lifetime_cap_reached' | 'pilot_exposure_cap_reached'
      limitCents: number
      projectedCents: number
    }

export function evaluatePilotReservation(
  usage: PilotUsage,
  proposedCustomerChargeCents: number,
  caps: PilotCaps,
): PilotReservationDecision {
  if (!Number.isSafeInteger(proposedCustomerChargeCents) || proposedCustomerChargeCents <= 0 || proposedCustomerChargeCents > caps.transactionCents) {
    return {
      allowed: false,
      code: 'pilot_transaction_cap_exceeded',
      limitCents: caps.transactionCents,
      projectedCents: proposedCustomerChargeCents,
    }
  }

  const projectedDailyCustomerChargesCents = usage.dailyCustomerChargesCents + proposedCustomerChargeCents
  if (projectedDailyCustomerChargesCents > caps.dailyCustomerChargesCents) {
    return {
      allowed: false,
      code: 'pilot_daily_cap_reached',
      limitCents: caps.dailyCustomerChargesCents,
      projectedCents: projectedDailyCustomerChargesCents,
    }
  }

  const projectedLifetimeCustomerChargesCents = usage.lifetimeCustomerChargesCents + proposedCustomerChargeCents
  if (projectedLifetimeCustomerChargesCents > caps.lifetimeCustomerChargesCents) {
    return {
      allowed: false,
      code: 'pilot_lifetime_cap_reached',
      limitCents: caps.lifetimeCustomerChargesCents,
      projectedCents: projectedLifetimeCustomerChargesCents,
    }
  }

  const projectedLifetimePaymentCount = usage.lifetimePaymentCount + 1
  const reservedStripeOverheadCents = Math.max(
    projectedLifetimePaymentCount * PILOT_STRIPE_OVERHEAD_RESERVE_CENTS_PER_PAYMENT,
    usage.observedStripeFeesCents,
  )
  const projectedLifetimeExposureCents = projectedLifetimeCustomerChargesCents + reservedStripeOverheadCents
  if (projectedLifetimeExposureCents > caps.lifetimeExposureCents) {
    return {
      allowed: false,
      code: 'pilot_exposure_cap_reached',
      limitCents: caps.lifetimeExposureCents,
      projectedCents: projectedLifetimeExposureCents,
    }
  }

  return {
    allowed: true,
    projectedDailyCustomerChargesCents,
    projectedLifetimeCustomerChargesCents,
    projectedLifetimeExposureCents,
    projectedLifetimePaymentCount,
  }
}

export function maximumWorkValueForTransaction(clientFeeBasisPoints: number, transactionCapCents: number = APPROVED_MILESTONE_PILOT_CAPS.transactionCents) {
  if (!Number.isSafeInteger(clientFeeBasisPoints) || clientFeeBasisPoints < 0 || clientFeeBasisPoints > 10_000) {
    throw new Error('Client fee basis points must be an integer between 0 and 10000')
  }
  let workValueCents = Math.floor(transactionCapCents * 10_000 / (10_000 + clientFeeBasisPoints))
  while (workValueCents + Math.round(workValueCents * clientFeeBasisPoints / 10_000) > transactionCapCents) workValueCents -= 1
  return workValueCents
}

export function splitWorkValueForPilot(workValueCents: number, clientFeeBasisPoints: number, transactionCapCents: number = APPROVED_MILESTONE_PILOT_CAPS.transactionCents) {
  if (!Number.isSafeInteger(workValueCents) || workValueCents < 500) throw new Error('Work value must be an integer of at least 500 cents')
  const maximumWorkValueCents = maximumWorkValueForTransaction(clientFeeBasisPoints, transactionCapCents)
  const parts: number[] = []
  let remaining = workValueCents
  while (remaining > maximumWorkValueCents) {
    parts.push(maximumWorkValueCents)
    remaining -= maximumWorkValueCents
  }
  if (remaining > 0) parts.push(remaining)
  if (parts.at(-1)! < 500 && parts.length > 1) {
    const shortfall = 500 - parts.at(-1)!
    parts[parts.length - 2] -= shortfall
    parts[parts.length - 1] += shortfall
  }
  return parts
}
