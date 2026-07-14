import { describe, expect, it } from 'vitest'
import {
  APPROVED_MILESTONE_PILOT_CAPS,
  evaluatePilotReservation,
  maximumWorkValueForTransaction,
  PILOT_STRIPE_OVERHEAD_RESERVE_CENTS_PER_PAYMENT,
  splitWorkValueForPilot,
  type PilotUsage,
} from './payment-pilot-policy.js'

const emptyUsage: PilotUsage = {
  dailyCustomerChargesCents: 0,
  lifetimeCustomerChargesCents: 0,
  lifetimePaymentCount: 0,
  observedStripeFeesCents: 0,
}

describe('milestone payment pilot policy', () => {
  it('accepts an exact $500 customer charge and reserves Stripe exposure', () => {
    expect(evaluatePilotReservation(emptyUsage, 50_000, APPROVED_MILESTONE_PILOT_CAPS)).toEqual({
      allowed: true,
      projectedDailyCustomerChargesCents: 50_000,
      projectedLifetimeCustomerChargesCents: 50_000,
      projectedLifetimeExposureCents: 50_000 + PILOT_STRIPE_OVERHEAD_RESERVE_CENTS_PER_PAYMENT,
      projectedLifetimePaymentCount: 1,
    })
  })

  it('blocks a transaction even one cent above the approved maximum', () => {
    expect(evaluatePilotReservation(emptyUsage, 50_001, APPROVED_MILESTONE_PILOT_CAPS)).toMatchObject({
      allowed: false,
      code: 'pilot_transaction_cap_exceeded',
    })
  })

  it('counts open reservations against the daily and lifetime limits', () => {
    const usage = { ...emptyUsage, dailyCustomerChargesCents: 80_000, lifetimeCustomerChargesCents: 480_000, lifetimePaymentCount: 9 }
    expect(evaluatePilotReservation(usage, 20_001, APPROVED_MILESTONE_PILOT_CAPS)).toMatchObject({
      allowed: false,
      code: 'pilot_daily_cap_reached',
    })
    expect(evaluatePilotReservation({ ...usage, dailyCustomerChargesCents: 0 }, 20_001, APPROVED_MILESTONE_PILOT_CAPS)).toMatchObject({
      allowed: false,
      code: 'pilot_lifetime_cap_reached',
    })
  })

  it('blocks new work when the exposure reserve would exceed $8,000', () => {
    const usage = { ...emptyUsage, lifetimeCustomerChargesCents: 470_000, lifetimePaymentCount: 10 }
    expect(evaluatePilotReservation(usage, 10_000, APPROVED_MILESTONE_PILOT_CAPS)).toMatchObject({
      allowed: false,
      code: 'pilot_exposure_cap_reached',
    })
  })

  it('uses observed Stripe fees when they exceed the fixed reserve', () => {
    const usage = { ...emptyUsage, lifetimeCustomerChargesCents: 490_000, lifetimePaymentCount: 1, observedStripeFeesCents: 310_000 }
    expect(evaluatePilotReservation(usage, 500, APPROVED_MILESTONE_PILOT_CAPS)).toMatchObject({
      allowed: false,
      code: 'pilot_exposure_cap_reached',
    })
  })

  it('splits managed work so every 5% client-fee total stays at or below $500', () => {
    expect(maximumWorkValueForTransaction(500)).toBe(47_619)
    const parts = splitWorkValueForPilot(49_000, 500)
    expect(parts).toEqual([47_619, 1_381])
    expect(parts.every((part) => part + Math.round(part * 500 / 10_000) <= 50_000)).toBe(true)
  })
})
