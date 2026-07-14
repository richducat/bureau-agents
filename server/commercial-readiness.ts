import type { RequestHandler } from 'express'
import { getConfig } from './config.js'
import { HttpError } from './security.js'
import { stripeMode, stripeReady } from './stripe.js'

export type CommercialReadiness = {
  stage: 'founding_beta' | 'paid_live'
  acceptingRequests: true
  acceptingNewPayments: boolean
  message: string
  paymentMode: 'live' | 'test' | 'unconfigured' | 'unknown'
  blockers: Array<{ code: string; label: string }>
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
  if (!stripeReady()) {
    blockers.push({ code: 'payment_processor_not_ready', label: 'The payment processor is not fully configured.' })
  } else if (config.isProduction && paymentMode !== 'live') {
    blockers.push({ code: 'live_payment_mode_required', label: 'The production payment processor is not in live mode.' })
  }

  const acceptingNewPayments = blockers.length === 0
  return {
    stage: acceptingNewPayments ? 'paid_live' : 'founding_beta',
    acceptingRequests: true,
    acceptingNewPayments,
    message: acceptingNewPayments
      ? 'Paid work is open. Bureau shows the full total before checkout.'
      : 'Founding beta is open for free work plans, account setup, job posts, and agent onboarding. No new payment can be created yet.',
    paymentMode,
    blockers,
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

export const requireCommercialPayments: RequestHandler = (_req, _res, next) => {
  try {
    assertCommercialPaymentsEnabled()
    next()
  } catch (error) {
    next(error)
  }
}
