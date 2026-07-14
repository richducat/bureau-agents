import type { RequestHandler } from 'express'
import { getConfig } from './config.js'
import { HttpError } from './security.js'
import { stripeMode, stripeReady } from './stripe.js'

export type CommercialReadiness = {
  stage: 'founding_beta' | 'milestone_pilot'
  acceptingRequests: true
  acceptingNewPayments: boolean
  message: string
  paymentMode: 'live' | 'test' | 'unconfigured' | 'unknown'
  blockers: Array<{ code: string; label: string }>
  paymentProducts: {
    milestoneFunding: boolean
    subscriptions: false
    agentVerificationPurchases: false
  }
  pilotLimits: {
    currency: 'USD'
    transactionCapCents: number
    dailyChargeCapCents: number
    lifetimeChargeCapCents: number
    lifetimeExposureCapCents: number
  }
}

export function commercialReadiness(): CommercialReadiness {
  const config = getConfig()
  const paymentMode = stripeMode()
  const blockers: CommercialReadiness['blockers'] = []

  if (!config.LEGAL_REVIEW_COMPLETED) {
    blockers.push({ code: 'legal_review_pending', label: 'Marketplace terms require professional legal review.' })
  }
  if (!config.TAX_REVIEW_COMPLETED) {
    blockers.push({ code: 'tax_review_pending', label: 'Marketplace tax and reporting setup requires professional review.' })
  }
  if (!config.COMMERCIAL_PAYMENTS_ENABLED) {
    blockers.push({ code: 'operator_activation_pending', label: 'The Bureau operator has not activated consumer payments.' })
  }
  if (!config.MILESTONE_PAYMENT_PILOT_ENABLED) {
    blockers.push({ code: 'milestone_payment_pilot_disabled', label: 'The approved milestone-payment pilot is not enabled.' })
  }
  if (!stripeReady()) {
    blockers.push({ code: 'payment_processor_not_ready', label: 'The payment processor is not fully configured.' })
  } else if (config.isProduction && paymentMode !== 'live') {
    blockers.push({ code: 'live_payment_mode_required', label: 'The production payment processor is not in live mode.' })
  }

  const acceptingNewPayments = blockers.length === 0
  const pilotLimits = {
    currency: 'USD' as const,
    transactionCapCents: config.PILOT_TRANSACTION_CAP_CENTS,
    dailyChargeCapCents: config.PILOT_DAILY_CHARGE_CAP_CENTS,
    lifetimeChargeCapCents: config.PILOT_LIFETIME_CHARGE_CAP_CENTS,
    lifetimeExposureCapCents: config.PILOT_LIFETIME_EXPOSURE_CAP_CENTS,
  }
  return {
    stage: acceptingNewPayments ? 'milestone_pilot' : 'founding_beta',
    acceptingRequests: true,
    acceptingNewPayments,
    message: acceptingNewPayments
      ? 'The milestone-payment pilot is open. Bureau shows the full total before checkout; subscriptions and paid verification remain disabled.'
      : 'Founding beta is open for free work plans, account setup, job posts, and agent onboarding. No new payment can be created yet.',
    paymentMode,
    blockers,
    paymentProducts: {
      milestoneFunding: acceptingNewPayments,
      subscriptions: false,
      agentVerificationPurchases: false,
    },
    pilotLimits,
  }
}

export function assertCommercialPaymentsEnabled() {
  const readiness = commercialReadiness()
  if (!readiness.acceptingNewPayments) {
    throw new HttpError(
      503,
      'Bureau is accepting free work plans and founding-beta requests, but new payments are not activated yet.',
      'commercial_payments_not_enabled',
    )
  }
}

export const requireMilestonePayments: RequestHandler = (_req, _res, next) => {
  try {
    assertCommercialPaymentsEnabled()
    next()
  } catch (error) {
    next(error)
  }
}
