import Stripe from 'stripe'
import { getConfig } from './config.js'
import { HttpError } from './security.js'

let client: Stripe | undefined

export function stripeClient() {
  const key = getConfig().STRIPE_SECRET_KEY
  if (!key) throw new HttpError(503, 'Payments are not configured yet.', 'payments_not_configured')
  client ??= new Stripe(key, { appInfo: { name: 'Bureau', version: '1.0.0' } })
  return client
}

export function stripeReady() {
  const config = getConfig()
  return Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET)
}

export function stripeMode(): 'live' | 'test' | 'unconfigured' | 'unknown' {
  const key = getConfig().STRIPE_SECRET_KEY
  if (!key) return 'unconfigured'
  if (key.startsWith('sk_live_')) return 'live'
  if (key.startsWith('sk_test_')) return 'test'
  return 'unknown'
}
