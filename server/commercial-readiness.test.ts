import { afterEach, describe, expect, it } from 'vitest'
import { commercialReadiness } from './commercial-readiness.js'
import { resetConfigForTests } from './config.js'

const keys = [
  'NODE_ENV',
  'MYSQL_PASSWORD',
  'CSRF_SECRET',
  'DATA_ENCRYPTION_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'LEGAL_REVIEW_COMPLETED',
  'TAX_REVIEW_COMPLETED',
  'COMMERCIAL_PAYMENTS_ENABLED',
  'MILESTONE_PAYMENT_PILOT_ENABLED',
  'PILOT_TRANSACTION_CAP_CENTS',
  'PILOT_DAILY_CHARGE_CAP_CENTS',
  'PILOT_LIFETIME_CHARGE_CAP_CENTS',
  'PILOT_LIFETIME_EXPOSURE_CAP_CENTS',
] as const

const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of keys) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetConfigForTests()
})

describe('commercial payment readiness', () => {
  it('fails closed by default while keeping free requests open', () => {
    for (const key of keys) delete process.env[key]
    resetConfigForTests()
    const readiness = commercialReadiness()
    expect(readiness).toMatchObject({
      stage: 'founding_beta',
      acceptingRequests: true,
      acceptingNewPayments: false,
      paymentMode: 'unconfigured',
    })
    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([
      'legal_review_pending',
      'tax_review_pending',
      'operator_activation_pending',
      'milestone_payment_pilot_disabled',
      'payment_processor_not_ready',
    ])
    expect(readiness.message).toContain('Checkout is temporarily unavailable')
    expect(readiness.message).not.toMatch(/founding beta/i)
  })

  it('does not treat test Stripe credentials as production payment readiness', () => {
    process.env.NODE_ENV = 'production'
    process.env.MYSQL_PASSWORD = 'test-password'
    process.env.CSRF_SECRET = 'x'.repeat(32)
    process.env.DATA_ENCRYPTION_KEY = '11'.repeat(32)
    process.env.STRIPE_SECRET_KEY = 'sk_test_example'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example'
    process.env.LEGAL_REVIEW_COMPLETED = 'true'
    process.env.TAX_REVIEW_COMPLETED = 'true'
    process.env.COMMERCIAL_PAYMENTS_ENABLED = 'true'
    process.env.MILESTONE_PAYMENT_PILOT_ENABLED = 'true'
    resetConfigForTests()
    const readiness = commercialReadiness()
    expect(readiness.acceptingNewPayments).toBe(false)
    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual(['live_payment_mode_required'])
  })

  it('opens paid work only after every approval and live processor requirement passes', () => {
    process.env.NODE_ENV = 'production'
    process.env.MYSQL_PASSWORD = 'test-password'
    process.env.CSRF_SECRET = 'x'.repeat(32)
    process.env.DATA_ENCRYPTION_KEY = '11'.repeat(32)
    process.env.STRIPE_SECRET_KEY = 'sk_live_example'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example'
    process.env.LEGAL_REVIEW_COMPLETED = 'true'
    process.env.TAX_REVIEW_COMPLETED = 'true'
    process.env.COMMERCIAL_PAYMENTS_ENABLED = 'true'
    process.env.MILESTONE_PAYMENT_PILOT_ENABLED = 'true'
    resetConfigForTests()
    const readiness = commercialReadiness()
    expect(readiness).toMatchObject({
      stage: 'milestone_pilot',
      acceptingNewPayments: true,
      paymentMode: 'live',
      blockers: [],
      paymentProducts: {
        milestoneFunding: true,
        subscriptions: false,
        agentVerificationPurchases: false,
      },
    })
    expect(readiness.message).toContain('Pay-per-task milestone checkout is live')
    expect(readiness.message).not.toMatch(/pilot/i)
  })

  it('refuses a configured limit above the approved pilot authorization', () => {
    process.env.PILOT_TRANSACTION_CAP_CENTS = '50001'
    resetConfigForTests()
    expect(() => commercialReadiness()).toThrow()
  })
})
