import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type Stripe from 'stripe'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { execute, one, rows, transaction } from '../db.js'
import { calculateFees } from '../fees.js'
import { fundingMustFailClosed } from '../funding-safety.js'
import { commercialReadiness, requireMilestonePayments } from '../commercial-readiness.js'
import { assertPilotReservation, lockAndReadPilotUsage } from '../payment-pilot.js'
import {
  asyncRoute,
  HttpError,
  membershipFor,
  requireAuth,
  requireVerifiedEmail,
  sha256,
} from '../security.js'
import { stripeClient } from '../stripe.js'
import { enqueueAgentWebhook } from '../webhooks.js'

type GenericRow = RowDataPacket
const uuid = z.string().uuid()

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many payment requests. Try again shortly.' } },
})

function toDate(unixSeconds: number | null | undefined) {
  return unixSeconds ? new Date(unixSeconds * 1000) : null
}

function checkoutCustomerId(session: Stripe.Checkout.Session) {
  if (typeof session.customer === 'string') return session.customer
  return session.customer?.id ?? null
}

function checkoutUrlMatches(url: string | null | undefined, pathname: string) {
  if (!url) return false
  try {
    const candidate = new URL(url)
    const app = new URL(getConfig().APP_ORIGIN)
    return candidate.origin === app.origin && candidate.pathname === pathname
  } catch {
    return false
  }
}

async function disabledBureauCheckoutKind(session: Stripe.Checkout.Session): Promise<'subscription' | 'agent_verification' | null> {
  const metadata = session.metadata
  const customerId = checkoutCustomerId(session)
  if (!metadata || !customerId) return null

  if (
    metadata.kind === 'subscription'
    && metadata.organization_id
    && ['operator_pro', 'client_scale'].includes(metadata.plan ?? '')
    && checkoutUrlMatches(session.success_url, '/settings/billing')
    && checkoutUrlMatches(session.cancel_url, '/pricing')
  ) {
    const organization = await one<GenericRow>(
      'SELECT id FROM organizations WHERE id = ? AND stripe_customer_id = ?',
      [metadata.organization_id, customerId],
    )
    return organization ? 'subscription' : null
  }

  if (metadata.kind === 'agent_verification' && metadata.agent_id && metadata.organization_id) {
    const agent = await one<GenericRow>(
      `SELECT a.slug FROM agents a
       JOIN organizations o ON o.id = a.operator_org_id
       WHERE a.id = ? AND a.operator_org_id = ? AND o.stripe_customer_id = ?`,
      [metadata.agent_id, metadata.organization_id, customerId],
    )
    if (
      agent
      && checkoutUrlMatches(session.success_url, `/agents/${agent.slug}`)
      && checkoutUrlMatches(session.cancel_url, `/agents/${agent.slug}`)
    ) return 'agent_verification'
  }

  return null
}

async function ensureCustomer(organization: GenericRow, email: string) {
  if (organization.stripe_customer_id) return String(organization.stripe_customer_id)
  const customer = await stripeClient().customers.create({
    email,
    name: String(organization.name),
    metadata: { bureau_organization_id: String(organization.id) },
  }, { idempotencyKey: `bureau_customer_${organization.id}` })
  await execute('UPDATE organizations SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL', [customer.id, organization.id])
  return customer.id
}

export const billingRouter = Router()
billingRouter.use(requireAuth, requireVerifiedEmail, paymentLimiter)

billingRouter.get('/economics', (req, res) => {
  const input = z.object({
    workValueCents: z.coerce.number().int().min(500).max(100_000_000),
    clientPlan: z.enum(['client_starter', 'client_scale']).default('client_starter'),
    operatorPlan: z.enum(['operator_starter', 'operator_pro']).default('operator_starter'),
  }).parse(req.query)
  res.json({ economics: calculateFees(input.workValueCents, input.clientPlan, input.operatorPlan) })
})

billingRouter.post('/connect/:organizationId/onboard', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  const membership = membershipFor(req, organizationId, ['owner', 'admin'])
  if (membership.kind !== 'operator') throw new HttpError(400, 'Only agent operator organizations receive payouts.', 'invalid_organization_kind')
  const organization = await one<GenericRow>('SELECT * FROM organizations WHERE id = ?', [organizationId])
  if (!organization) throw new HttpError(404, 'Organization not found.', 'organization_not_found')
  let accountId = organization.stripe_account_id ? String(organization.stripe_account_id) : ''
  if (!accountId) {
    const account = await stripeClient().accounts.create({
      type: 'express',
      email: req.authUser!.email,
      business_profile: { name: String(organization.name), product_description: 'AI agent services sold through Bureau' },
      capabilities: { transfers: { requested: true } },
      metadata: { bureau_organization_id: organizationId },
    }, { idempotencyKey: `bureau_connect_${organizationId}` })
    accountId = account.id
    await execute('UPDATE organizations SET stripe_account_id = ? WHERE id = ?', [accountId, organizationId])
  }
  const config = getConfig()
  const accountLink = await stripeClient().accountLinks.create({
    account: accountId,
    refresh_url: `${config.APP_ORIGIN}/settings/billing?connect=refresh`,
    return_url: `${config.APP_ORIGIN}/settings/billing?connect=return`,
    type: 'account_onboarding',
  })
  res.json({ onboardingUrl: accountLink.url, expiresAt: new Date(accountLink.expires_at * 1000).toISOString() })
}))

billingRouter.get('/connect/:organizationId/status', asyncRoute(async (req, res) => {
  const organizationId = uuid.parse(req.params.organizationId)
  membershipFor(req, organizationId)
  const organization = await one<GenericRow>('SELECT stripe_account_id FROM organizations WHERE id = ?', [organizationId])
  if (!organization?.stripe_account_id) return res.json({ connected: false, onboardingComplete: false, payoutsEnabled: false })
  const account = await stripeClient().accounts.retrieve(String(organization.stripe_account_id))
  const onboardingComplete = Boolean(account.details_submitted)
  const payoutsEnabled = Boolean(account.payouts_enabled)
  await execute(
    'UPDATE organizations SET stripe_onboarding_complete = ?, stripe_payouts_enabled = ? WHERE id = ?',
    [onboardingComplete, payoutsEnabled, organizationId],
  )
  res.json({ connected: true, onboardingComplete, payoutsEnabled, requirements: 'requirements' in account ? account.requirements : undefined })
}))

billingRouter.post('/subscriptions/checkout', (_req, _res, next) => {
  next(new HttpError(
    503,
    'New Bureau subscriptions are not currently offered. Existing subscriptions can still be managed without changing any Stripe product.',
    'subscription_checkout_disabled',
  ))
})

billingRouter.post('/subscriptions/portal', asyncRoute(async (req, res) => {
  const { organizationId } = z.object({ organizationId: uuid }).parse(req.body)
  membershipFor(req, organizationId, ['owner', 'admin', 'billing'])
  const organization = await one<GenericRow>('SELECT stripe_customer_id FROM organizations WHERE id = ?', [organizationId])
  if (!organization?.stripe_customer_id) throw new HttpError(409, 'No billing account exists yet.', 'billing_account_missing')
  const portal = await stripeClient().billingPortal.sessions.create({
    customer: String(organization.stripe_customer_id),
    return_url: `${getConfig().APP_ORIGIN}/settings/billing`,
  })
  res.json({ portalUrl: portal.url })
}))

billingRouter.post('/agents/:agentId/verification-checkout', (_req, _res, next) => {
  next(new HttpError(
    503,
    'Paid agent verification is not currently offered. Agent onboarding and evidence review remain available without a verification purchase.',
    'verification_checkout_disabled',
  ))
})

billingRouter.post('/milestones/:milestoneId/checkout', requireMilestonePayments, asyncRoute(async (req, res) => {
  const milestoneId = uuid.parse(req.params.milestoneId)
  const idempotencyKey = (req.get('idempotency-key') ?? '').trim()
  if (!/^[a-zA-Z0-9:_-]{12,200}$/.test(idempotencyKey)) {
    throw new HttpError(400, 'A unique Idempotency-Key header of at least 12 characters is required.', 'idempotency_key_required')
  }
  const milestone = await one<GenericRow>(
    `SELECT m.*, c.client_org_id, c.operator_org_id, c.client_fee_basis_points, c.operator_fee_basis_points,
      c.title AS contract_title, c.status AS contract_status, co.name AS client_name, co.stripe_customer_id,
      EXISTS(
        SELECT 1 FROM task_requests tr
        WHERE tr.contract_id = c.id AND tr.source_platform = 'upwork'
          AND tr.source_verification_status = 'legacy_unverified'
      ) AS legacy_unverified_source,
      oo.name AS operator_name, oo.kind AS operator_kind, oo.stripe_account_id, oo.stripe_payouts_enabled
     FROM milestones m JOIN contracts c ON c.id = m.contract_id
     JOIN organizations co ON co.id = c.client_org_id JOIN organizations oo ON oo.id = c.operator_org_id
     WHERE m.id = ?`,
    [milestoneId],
  )
  if (!milestone) throw new HttpError(404, 'Milestone not found.', 'milestone_not_found')
  membershipFor(req, String(milestone.client_org_id), ['owner', 'admin', 'billing'])
  if (fundingMustFailClosed(milestone.contract_status, milestone.legacy_unverified_source)) {
    throw new HttpError(409, 'This older quote was invalidated and cannot be funded. Submit a fresh job-reference request for an automatic bounded catalog quote.', 'legacy_quote_repricing_required')
  }
  if (milestone.operator_kind !== 'platform' && (!milestone.stripe_account_id || !milestone.stripe_payouts_enabled)) {
    throw new HttpError(409, 'The agent operator must finish payout verification before this milestone can be funded.', 'operator_payouts_not_ready')
  }
  if (!['unfunded', 'funding'].includes(String(milestone.status))) throw new HttpError(409, 'This milestone has already been funded.', 'milestone_already_funded')
  const existing = await one<GenericRow>('SELECT * FROM payments WHERE idempotency_key = ?', [idempotencyKey])
  if (existing?.stripe_checkout_session_id) {
    const prior = await stripeClient().checkout.sessions.retrieve(String(existing.stripe_checkout_session_id))
    return res.json({ checkoutUrl: prior.url, paymentId: existing.id, reused: true })
  }
  const openPayment = await one<GenericRow>(
    `SELECT * FROM payments WHERE milestone_id = ? AND status IN ('created','checkout_open','paid','release_pending') ORDER BY created_at DESC LIMIT 1`,
    [milestoneId],
  )
  if (openPayment?.stripe_checkout_session_id) {
    const prior = await stripeClient().checkout.sessions.retrieve(String(openPayment.stripe_checkout_session_id))
    return res.json({ checkoutUrl: prior.url, paymentId: openPayment.id, reused: true })
  }
  if (openPayment) throw new HttpError(409, 'Milestone funding is already being prepared. Retry with the same idempotency key.', 'funding_in_progress')

  const workValueCents = Number(milestone.work_value_cents)
  const clientFeeCents = Math.round(workValueCents * Number(milestone.client_fee_basis_points) / 10_000)
  const operatorFeeCents = Math.round(workValueCents * Number(milestone.operator_fee_basis_points) / 10_000)
  const clientTotalCents = workValueCents + clientFeeCents
  const operatorNetCents = workValueCents - operatorFeeCents
  const paymentId = randomUUID()

  try {
    await transaction(async (connection) => {
      const usage = await lockAndReadPilotUsage(connection)
      assertPilotReservation(usage, clientTotalCents)
      await connection.execute(
        `INSERT INTO payments
         (id, milestone_id, client_org_id, operator_org_id, idempotency_key, work_value_cents, client_fee_cents,
          operator_fee_cents, client_total_cents, operator_net_cents, bureau_gross_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, milestoneId, milestone.client_org_id, milestone.operator_org_id, idempotencyKey,
          workValueCents, clientFeeCents, operatorFeeCents, clientTotalCents, operatorNetCents, clientFeeCents + operatorFeeCents],
      )
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Milestone funding is already in progress.', 'funding_in_progress')
    throw error
  }
  try {
    const config = getConfig()
    const customer = await ensureCustomer({
      id: milestone.client_org_id,
      name: milestone.client_name,
      stripe_customer_id: milestone.stripe_customer_id,
    } as GenericRow, req.authUser!.email)
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      customer,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: { currency: 'usd', unit_amount: workValueCents, product_data: { name: String(milestone.title), description: `Protected milestone funding for ${milestone.contract_title}` } },
          quantity: 1,
        },
        {
          price_data: { currency: 'usd', unit_amount: clientFeeCents, product_data: { name: 'Bureau client service fee', description: `${Number(milestone.client_fee_basis_points) / 100}% marketplace, payment protection, and dispute operations` } },
          quantity: 1,
        },
      ],
      success_url: `${config.APP_ORIGIN}/contracts/${milestone.contract_id}?funding=success`,
      cancel_url: `${config.APP_ORIGIN}/contracts/${milestone.contract_id}?funding=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: { kind: 'milestone_funding', payment_id: paymentId, milestone_id: milestoneId, contract_id: String(milestone.contract_id) },
      payment_intent_data: {
        transfer_group: `bureau_contract_${milestone.contract_id}`,
        metadata: { bureau_payment_id: paymentId, bureau_milestone_id: milestoneId, bureau_contract_id: String(milestone.contract_id) },
      },
    }, { idempotencyKey: `bureau_fund_${sha256(idempotencyKey).slice(0, 32)}` })
    await transaction(async (connection) => {
      await connection.execute(`UPDATE payments SET stripe_checkout_session_id = ?, status = 'checkout_open' WHERE id = ?`, [session.id, paymentId])
      await connection.execute(`UPDATE milestones SET status = 'funding' WHERE id = ? AND status = 'unfunded'`, [milestoneId])
    })
    res.status(201).json({ checkoutUrl: session.url, paymentId, economics: { workValueCents, clientFeeCents, clientTotalCents, operatorFeeCents, operatorNetCents, bureauGrossCents: clientFeeCents + operatorFeeCents } })
  } catch (error) {
    await execute(`UPDATE payments SET status = 'failed' WHERE id = ?`, [paymentId])
    throw error
  }
}))

billingRouter.post('/milestones/:milestoneId/approve', asyncRoute(async (req, res) => {
  const milestoneId = uuid.parse(req.params.milestoneId)
  const payment = await one<GenericRow>(
    `SELECT p.*, m.status AS milestone_status, m.contract_id, c.client_org_id, c.agent_id,
      o.kind AS operator_kind, o.stripe_account_id, o.stripe_payouts_enabled
     FROM payments p JOIN milestones m ON m.id = p.milestone_id JOIN contracts c ON c.id = m.contract_id
     JOIN organizations o ON o.id = c.operator_org_id
     WHERE p.milestone_id = ? AND p.status IN ('paid','release_pending') ORDER BY p.created_at DESC LIMIT 1`,
    [milestoneId],
  )
  if (!payment) throw new HttpError(409, 'No paid milestone is ready for approval.', 'payment_not_ready')
  membershipFor(req, String(payment.client_org_id), ['owner', 'admin', 'member'])
  if (payment.milestone_status !== 'submitted') throw new HttpError(409, 'The operator must submit a deliverable before approval.', 'deliverable_not_submitted')
  const platformManaged = payment.operator_kind === 'platform'
  if (!payment.stripe_charge_id || (!platformManaged && (!payment.stripe_account_id || !payment.stripe_payouts_enabled))) {
    throw new HttpError(409, 'Payout details are not ready.', 'payout_not_ready')
  }
  if (payment.stripe_transfer_id || (platformManaged && payment.status === 'released')) return res.json({ released: true, transferId: payment.stripe_transfer_id ?? null, reused: true })

  await execute(`UPDATE payments SET status = 'release_pending' WHERE id = ? AND status = 'paid'`, [payment.id])
  const transfer = platformManaged ? null : await stripeClient().transfers.create({
      amount: Number(payment.operator_net_cents),
      currency: 'usd',
      destination: String(payment.stripe_account_id),
      source_transaction: String(payment.stripe_charge_id),
      transfer_group: `bureau_contract_${payment.contract_id}`,
      metadata: { bureau_payment_id: String(payment.id), bureau_milestone_id: milestoneId, bureau_contract_id: String(payment.contract_id) },
    }, { idempotencyKey: `bureau_release_${payment.id}` })
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE payments SET stripe_transfer_id = ?, status = 'released', released_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [transfer?.id ?? null, payment.id],
    )
    await connection.execute(
      `UPDATE milestones SET status = 'released', approved_at = UTC_TIMESTAMP(3), released_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [milestoneId],
    )
    await connection.execute(
      `UPDATE contracts SET status = IF(
        NOT EXISTS (SELECT 1 FROM milestones WHERE contract_id = ? AND status <> 'released'),
        'completed', 'active'), completed_at = IF(NOT EXISTS (SELECT 1 FROM milestones WHERE contract_id = ? AND status <> 'released'), UTC_TIMESTAMP(3), NULL)
       WHERE id = ?`,
      [payment.contract_id, payment.contract_id, payment.contract_id],
    )
    await connection.execute(
      `UPDATE agents SET completed_contracts = completed_contracts + IF(
        NOT EXISTS (SELECT 1 FROM milestones WHERE contract_id = ? AND status <> 'released'), 1, 0)
       WHERE id = ?`,
      [payment.contract_id, payment.agent_id],
    )
  })
  await enqueueAgentWebhook(String(payment.agent_id), 'milestone.released', { contractId: String(payment.contract_id), milestoneId, paymentId: String(payment.id), operatorNetCents: Number(payment.operator_net_cents) })
  res.json({ released: true, transferId: transfer?.id ?? null, operatorNetCents: payment.operator_net_cents, platformManaged })
}))

async function markSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.bureau_organization_id
  const plan = subscription.metadata.bureau_plan
  if (!organizationId || !['client_scale', 'operator_pro'].includes(plan)) return
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const statusMap: Record<string, string> = { canceled: 'cancelled', incomplete: 'unpaid', incomplete_expired: 'unpaid' }
  const status = statusMap[subscription.status] ?? subscription.status
  const periodEnd = 'current_period_end' in subscription ? toDate((subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end) : null
  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO subscriptions
       (id, organization_id, plan, stripe_subscription_id, stripe_customer_id, status, current_period_end, cancel_at_period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), current_period_end = VALUES(current_period_end),
         cancel_at_period_end = VALUES(cancel_at_period_end), updated_at = UTC_TIMESTAMP(3)`,
      [randomUUID(), organizationId, plan, subscription.id, customerId, status, periodEnd, subscription.cancel_at_period_end],
    )
    const active = ['active', 'trialing'].includes(subscription.status)
    const fallback = plan === 'client_scale' ? 'client_starter' : 'operator_starter'
    await connection.execute('UPDATE organizations SET plan = ? WHERE id = ?', [active ? plan : fallback, organizationId])
  })
}

async function upsertExposureEvent(
  connection: PoolConnection,
  paymentId: string,
  stripeObjectId: string,
  eventKind: 'refund_principal' | 'dispute_principal' | 'additional_fee',
  amountCents: number,
  currency: string,
) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return
  await connection.execute(
    `INSERT INTO payment_stripe_exposure_events
       (payment_id, stripe_object_id, event_kind, amount_cents, currency)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE amount_cents = GREATEST(amount_cents, VALUES(amount_cents)), updated_at = UTC_TIMESTAMP(3)`,
    [paymentId, stripeObjectId, eventKind, amountCents, currency.toUpperCase().slice(0, 3)],
  )
}

async function recordDisputeExposure(dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
  const payment = await one<GenericRow>('SELECT id FROM payments WHERE stripe_charge_id = ?', [chargeId])
  if (!payment) return
  const additionalFeeCents = Array.isArray(dispute.balance_transactions)
    ? dispute.balance_transactions.reduce((sum, balanceTransaction) => sum + Math.max(0, Number(balanceTransaction.fee ?? 0)), 0)
    : 0
  await transaction(async (connection) => {
    await connection.execute(`UPDATE payments SET status = 'disputed' WHERE id = ?`, [payment.id])
    await upsertExposureEvent(connection, String(payment.id), dispute.id, 'dispute_principal', Number(dispute.amount ?? 0), dispute.currency ?? 'usd')
    await upsertExposureEvent(connection, String(payment.id), dispute.id, 'additional_fee', additionalFeeCents, dispute.currency ?? 'usd')
  })
}

async function recordRefundExposure(charge: Stripe.Charge) {
  const payment = await one<GenericRow>('SELECT id, milestone_id FROM payments WHERE stripe_charge_id = ?', [charge.id])
  if (!payment) return
  await transaction(async (connection) => {
    await connection.execute(`UPDATE payments SET status = 'refunded', refunded_at = UTC_TIMESTAMP(3) WHERE id = ?`, [payment.id])
    await connection.execute(
      `UPDATE milestones SET status = 'refunded' WHERE id = ? AND status IN ('unfunded','funding','funded')`,
      [payment.milestone_id],
    )
    await upsertExposureEvent(connection, String(payment.id), charge.id, 'refund_principal', Number(charge.amount_refunded ?? 0), charge.currency ?? 'usd')
  })
}

async function processCheckout(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind === 'agent_verification' && session.payment_status === 'paid') {
    if (await disabledBureauCheckoutKind(session) !== 'agent_verification') return
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
    if (!paymentIntentId) throw new Error('Disabled verification checkout has no PaymentIntent to refund')
    const refund = await stripeClient().refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: { kind: 'disabled_agent_verification_refund', agent_id: session.metadata.agent_id },
    }, { idempotencyKey: `bureau_disabled_verification_${session.id}` })
    await execute(
      `INSERT INTO audit_log (organization_id, action, target_type, target_id, metadata)
       VALUES (?, 'agent.verification_checkout_refunded', 'agent', ?, ?)`,
      [session.metadata.organization_id, session.metadata.agent_id, JSON.stringify({ checkoutSessionId: session.id, refundId: refund.id })],
    )
    return
  }
  if (session.metadata?.kind !== 'milestone_funding' || session.payment_status !== 'paid') return
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!paymentIntentId) throw new Error('Paid checkout has no PaymentIntent')
  const paymentIntent = await stripeClient().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
  const charge = typeof paymentIntent.latest_charge === 'string' ? await stripeClient().charges.retrieve(paymentIntent.latest_charge, { expand: ['balance_transaction'] }) : paymentIntent.latest_charge
  const balanceTransaction = charge && typeof charge.balance_transaction !== 'string' ? charge.balance_transaction : null
  const fundingGate = await one<GenericRow>(
    `SELECT p.id, p.client_org_id, m.id AS milestone_id, m.contract_id, c.status AS contract_status,
      EXISTS(
        SELECT 1 FROM task_requests tr
        WHERE tr.contract_id = c.id AND tr.source_platform = 'upwork'
          AND tr.source_verification_status = 'legacy_unverified'
      ) AS legacy_unverified_source
     FROM payments p JOIN milestones m ON m.id = p.milestone_id JOIN contracts c ON c.id = m.contract_id
     WHERE p.id = ?`,
    [session.metadata!.payment_id],
  )
  if (!fundingGate) throw new Error('Paid checkout does not map to a Bureau payment record')
  if (String(fundingGate.milestone_id) !== session.metadata!.milestone_id || String(fundingGate.contract_id) !== session.metadata!.contract_id) {
    throw new Error('Paid checkout metadata does not match its Bureau payment record')
  }
  const commercialGateClosed = !commercialReadiness().acceptingNewPayments
  const blockedFunding = commercialGateClosed || fundingMustFailClosed(fundingGate.contract_status, fundingGate.legacy_unverified_source)
  if (blockedFunding) {
    await transaction(async (connection) => {
      await connection.execute(
        `UPDATE payments SET stripe_payment_intent_id = ?, stripe_charge_id = ?, processor_fee_cents = ?,
          status = 'refund_pending', paid_at = COALESCE(paid_at, UTC_TIMESTAMP(3))
         WHERE id = ? AND status NOT IN ('released','refunded')`,
        [paymentIntentId, charge?.id ?? null, balanceTransaction?.fee ?? null, session.metadata!.payment_id],
      )
      await connection.execute(`UPDATE contracts SET status = 'cancelled' WHERE id = ? AND status = 'pending_funding'`, [fundingGate!.contract_id])
      await connection.execute(
        `INSERT INTO audit_log (organization_id, action, target_type, target_id, metadata)
         VALUES (?, 'payment.blocked_funding_refund_started', 'payment', ?, ?)`,
        [fundingGate!.client_org_id, session.metadata!.payment_id, JSON.stringify({ checkoutSessionId: session.id, paymentIntentId, contractId: fundingGate!.contract_id })],
      )
    })
    const refund = await stripeClient().refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        bureau_payment_id: session.metadata!.payment_id,
        bureau_contract_id: String(fundingGate!.contract_id),
        reason: commercialGateClosed ? 'milestone_pilot_disabled' : Number(fundingGate.legacy_unverified_source) > 0 ? 'legacy_unverified_quote_blocked' : 'cancelled_contract_blocked',
      },
    }, { idempotencyKey: `bureau_blocked_funding_${session.metadata!.payment_id}` })
    const refunded = refund.status === 'succeeded'
    await transaction(async (connection) => {
      await connection.execute(
        `UPDATE payments SET status = ?, refunded_at = IF(?, UTC_TIMESTAMP(3), refunded_at) WHERE id = ? AND status <> 'released'`,
        [refunded ? 'refunded' : 'refund_pending', refunded, session.metadata!.payment_id],
      )
      if (refunded) {
        await connection.execute(
          `UPDATE milestones SET status = 'refunded' WHERE id = ? AND status IN ('unfunded','funding','funded')`,
          [fundingGate!.milestone_id],
        )
      }
      await connection.execute(
        `INSERT INTO audit_log (organization_id, action, target_type, target_id, metadata)
         VALUES (?, ?, 'payment', ?, ?)`,
        [fundingGate!.client_org_id, refunded ? 'payment.blocked_funding_refunded' : 'payment.blocked_funding_refund_pending',
          session.metadata!.payment_id, JSON.stringify({ refundId: refund.id, refundStatus: refund.status, contractId: fundingGate!.contract_id })],
      )
    })
    return
  }
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE payments SET stripe_payment_intent_id = ?, stripe_charge_id = ?, processor_fee_cents = ?, status = 'paid', paid_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND status IN ('created','checkout_open')`,
      [paymentIntentId, charge?.id ?? null, balanceTransaction?.fee ?? null, session.metadata!.payment_id],
    )
    await connection.execute(
      `UPDATE milestones SET status = 'funded', funded_at = UTC_TIMESTAMP(3) WHERE id = ? AND status IN ('unfunded','funding')`,
      [session.metadata!.milestone_id],
    )
    await connection.execute(
      `UPDATE contracts SET status = 'active', started_at = COALESCE(started_at, UTC_TIMESTAMP(3)) WHERE id = ? AND status = 'pending_funding'`,
      [session.metadata!.contract_id],
    )
  })
  const funded = await one<GenericRow>(
    `SELECT c.agent_id FROM payments p JOIN milestones m ON m.id = p.milestone_id JOIN contracts c ON c.id = m.contract_id WHERE p.id = ?`,
    [session.metadata!.payment_id],
  )
  if (funded) await enqueueAgentWebhook(String(funded.agent_id), 'milestone.funded', { paymentId: session.metadata!.payment_id, milestoneId: session.metadata!.milestone_id, contractId: session.metadata!.contract_id })
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  const config = getConfig()
  if (!config.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Stripe webhook is not configured.', 'payments_not_configured')
  const signature = req.get('stripe-signature')
  if (!signature || !Buffer.isBuffer(req.body)) throw new HttpError(400, 'Invalid Stripe webhook.', 'invalid_webhook')
  const event = stripeClient().webhooks.constructEvent(req.body, signature, config.STRIPE_WEBHOOK_SECRET)
  const payloadHash = sha256(req.body)
  try {
    await execute(
      `INSERT INTO webhook_events (provider, external_id, event_type, payload_sha256) VALUES ('stripe', ?, ?, ?)`,
      [event.id, event.type, payloadHash],
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') return res.json({ received: true, duplicate: true })
    throw error
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await processCheckout(event.data.object as Stripe.Checkout.Session)
        break
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.kind === 'milestone_funding' && session.metadata.payment_id && session.metadata.milestone_id) {
          await transaction(async (connection) => {
            await connection.execute(
              `UPDATE payments SET status = 'failed' WHERE id = ? AND paid_at IS NULL AND status IN ('created','checkout_open')`,
              [session.metadata!.payment_id],
            )
            await connection.execute(
              `UPDATE milestones SET status = 'unfunded' WHERE id = ? AND status = 'funding'`,
              [session.metadata!.milestone_id],
            )
          })
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await markSubscription(event.data.object as Stripe.Subscription)
        break
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const organizationId = account.metadata?.bureau_organization_id
        if (organizationId) {
          await execute(
            `UPDATE organizations SET stripe_onboarding_complete = ?, stripe_payouts_enabled = ? WHERE id = ?`,
            [Boolean(account.details_submitted), Boolean(account.payouts_enabled), organizationId],
          )
        }
        break
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent
        if (intent.metadata.bureau_payment_id) {
          await execute(`UPDATE payments SET status = 'failed' WHERE id = ? AND status <> 'released'`, [intent.metadata.bureau_payment_id])
          await execute(`UPDATE milestones SET status = 'unfunded' WHERE id = ? AND status = 'funding'`, [intent.metadata.bureau_milestone_id])
        }
        break
      }
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed': {
        await recordDisputeExposure(event.data.object as Stripe.Dispute)
        break
      }
      case 'charge.refunded': {
        await recordRefundExposure(event.data.object as Stripe.Charge)
        break
      }
      default:
        await execute(`UPDATE webhook_events SET status = 'ignored', processed_at = UTC_TIMESTAMP(3) WHERE provider = 'stripe' AND external_id = ?`, [event.id])
        return res.json({ received: true, ignored: true })
    }
    await execute(`UPDATE webhook_events SET status = 'processed', processed_at = UTC_TIMESTAMP(3) WHERE provider = 'stripe' AND external_id = ?`, [event.id])
    res.json({ received: true })
  } catch (error) {
    await execute(
      `UPDATE webhook_events SET status = 'failed', error_message = ? WHERE provider = 'stripe' AND external_id = ?`,
      [(error instanceof Error ? error.message : 'Webhook processing failed').slice(0, 500), event.id],
    )
    throw error
  }
}

export async function reconcileBureauCheckoutSessions() {
  const readiness = commercialReadiness()
  const openPayments = await rows<GenericRow>(
    `SELECT p.id, p.stripe_checkout_session_id, p.status, m.id AS milestone_id, c.status AS contract_status
     FROM payments p JOIN milestones m ON m.id = p.milestone_id JOIN contracts c ON c.id = m.contract_id
     WHERE p.stripe_checkout_session_id IS NOT NULL
       AND p.status IN ('created','checkout_open','refund_pending')
     ORDER BY p.created_at ASC LIMIT 500`,
  )
  let reconciled = 0
  for (const payment of openPayments) {
    try {
      const session = await stripeClient().checkout.sessions.retrieve(String(payment.stripe_checkout_session_id))
      if (session.status === 'open' && (payment.contract_status === 'cancelled' || !readiness.acceptingNewPayments)) {
        await stripeClient().checkout.sessions.expire(session.id)
        await transaction(async (connection) => {
          await connection.execute(`UPDATE payments SET status = 'failed' WHERE id = ? AND status IN ('created','checkout_open')`, [payment.id])
          await connection.execute(`UPDATE milestones SET status = 'unfunded' WHERE id = ? AND status = 'funding'`, [payment.milestone_id])
        })
        reconciled += 1
      } else if (session.status === 'complete' && session.payment_status === 'paid') {
        await processCheckout(session)
        reconciled += 1
      } else if (session.status === 'expired') {
        await transaction(async (connection) => {
          await connection.execute(`UPDATE payments SET status = 'failed' WHERE id = ? AND status IN ('created','checkout_open')`, [payment.id])
          await connection.execute(`UPDATE milestones SET status = 'unfunded' WHERE id = ? AND status = 'funding'`, [payment.milestone_id])
        })
        reconciled += 1
      }
    } catch (error) {
      console.error(`[billing-cleanup] Could not reconcile Bureau checkout ${payment.stripe_checkout_session_id}:`, error instanceof Error ? error.message : 'unknown error')
    }
  }

  // These session kinds are Bureau-specific, but intentionally have no new
  // checkout endpoint while subscriptions are not offered. Expiring a stale link does not alter
  // its Stripe product or any existing subscription.
  let startingAfter: string | undefined
  for (let page = 0; page < 5; page += 1) {
    const sessions = await stripeClient().checkout.sessions.list({ status: 'open', limit: 100, starting_after: startingAfter })
    for (const session of sessions.data) {
      const disabledKind = await disabledBureauCheckoutKind(session)
      if (!disabledKind) continue
      try {
        await stripeClient().checkout.sessions.expire(session.id)
        reconciled += 1
      } catch (error) {
        console.error(`[billing-cleanup] Could not expire disabled Bureau ${disabledKind} checkout ${session.id}:`, error instanceof Error ? error.message : 'unknown error')
      }
    }
    if (!sessions.has_more || !sessions.data.length) break
    startingAfter = sessions.data.at(-1)!.id
  }
  return reconciled
}
