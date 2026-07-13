import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type Stripe from 'stripe'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { execute, one, transaction } from '../db.js'
import { calculateFees } from '../fees.js'
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
    refresh_url: `${config.APP_ORIGIN}/settings/payments?connect=refresh`,
    return_url: `${config.APP_ORIGIN}/settings/payments?connect=return`,
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

billingRouter.post('/subscriptions/checkout', asyncRoute(async (req, res) => {
  const input = z.object({ organizationId: uuid, plan: z.enum(['operator_pro', 'client_scale']) }).parse(req.body)
  const membership = membershipFor(req, input.organizationId, ['owner', 'admin', 'billing'])
  if ((input.plan === 'operator_pro' && membership.kind !== 'operator') || (input.plan === 'client_scale' && membership.kind !== 'client')) {
    throw new HttpError(400, 'That plan does not apply to this organization.', 'invalid_plan')
  }
  const config = getConfig()
  const price = input.plan === 'operator_pro' ? config.STRIPE_PRICE_OPERATOR_PRO : config.STRIPE_PRICE_CLIENT_SCALE
  if (!price) throw new HttpError(503, 'Subscription price is not configured.', 'payments_not_configured')
  const organization = await one<GenericRow>('SELECT * FROM organizations WHERE id = ?', [input.organizationId])
  if (!organization) throw new HttpError(404, 'Organization not found.', 'organization_not_found')
  const customer = await ensureCustomer(organization, req.authUser!.email)
  const session = await stripeClient().checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${config.APP_ORIGIN}/settings/billing?checkout=success`,
    cancel_url: `${config.APP_ORIGIN}/pricing?checkout=cancelled`,
    metadata: { kind: 'subscription', organization_id: input.organizationId, plan: input.plan },
    subscription_data: { metadata: { bureau_organization_id: input.organizationId, bureau_plan: input.plan } },
  }, { idempotencyKey: `subscription_${input.organizationId}_${input.plan}_${req.get('idempotency-key') ?? randomUUID()}` })
  res.status(201).json({ checkoutUrl: session.url })
}))

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

billingRouter.post('/agents/:agentId/verification-checkout', asyncRoute(async (req, res) => {
  const agentId = uuid.parse(req.params.agentId)
  const config = getConfig()
  if (!config.STRIPE_PRICE_VERIFIED_AGENT) throw new HttpError(503, 'Verification checkout is not configured.', 'payments_not_configured')
  const agent = await one<GenericRow>(
    `SELECT a.*, o.name AS organization_name, o.stripe_customer_id FROM agents a JOIN organizations o ON o.id = a.operator_org_id WHERE a.id = ?`,
    [agentId],
  )
  if (!agent) throw new HttpError(404, 'Agent not found.', 'agent_not_found')
  membershipFor(req, String(agent.operator_org_id), ['owner', 'admin', 'billing'])
  const organization = { id: agent.operator_org_id, name: agent.organization_name, stripe_customer_id: agent.stripe_customer_id } as GenericRow
  const customer = await ensureCustomer(organization, req.authUser!.email)
  const session = await stripeClient().checkout.sessions.create({
    mode: 'payment',
    customer,
    line_items: [{ price: config.STRIPE_PRICE_VERIFIED_AGENT, quantity: 1 }],
    success_url: `${config.APP_ORIGIN}/agents/${agent.slug}?verification=purchased`,
    cancel_url: `${config.APP_ORIGIN}/agents/${agent.slug}?verification=cancelled`,
    metadata: { kind: 'agent_verification', agent_id: agentId, organization_id: String(agent.operator_org_id) },
  }, { idempotencyKey: `verification_${agentId}` })
  res.status(201).json({ checkoutUrl: session.url })
}))

billingRouter.post('/milestones/:milestoneId/checkout', asyncRoute(async (req, res) => {
  const milestoneId = uuid.parse(req.params.milestoneId)
  const idempotencyKey = (req.get('idempotency-key') ?? '').trim()
  if (!/^[a-zA-Z0-9:_-]{12,200}$/.test(idempotencyKey)) {
    throw new HttpError(400, 'A unique Idempotency-Key header of at least 12 characters is required.', 'idempotency_key_required')
  }
  const milestone = await one<GenericRow>(
    `SELECT m.*, c.client_org_id, c.operator_org_id, c.client_fee_basis_points, c.operator_fee_basis_points,
      c.title AS contract_title, co.name AS client_name, co.stripe_customer_id,
      oo.name AS operator_name, oo.kind AS operator_kind, oo.stripe_account_id, oo.stripe_payouts_enabled
     FROM milestones m JOIN contracts c ON c.id = m.contract_id
     JOIN organizations co ON co.id = c.client_org_id JOIN organizations oo ON oo.id = c.operator_org_id
     WHERE m.id = ?`,
    [milestoneId],
  )
  if (!milestone) throw new HttpError(404, 'Milestone not found.', 'milestone_not_found')
  membershipFor(req, String(milestone.client_org_id), ['owner', 'admin', 'billing'])
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
  const customer = await ensureCustomer({
    id: milestone.client_org_id,
    name: milestone.client_name,
    stripe_customer_id: milestone.stripe_customer_id,
  } as GenericRow, req.authUser!.email)

  try {
    await execute(
      `INSERT INTO payments
       (id, milestone_id, client_org_id, operator_org_id, idempotency_key, work_value_cents, client_fee_cents,
        operator_fee_cents, client_total_cents, operator_net_cents, bureau_gross_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, milestoneId, milestone.client_org_id, milestone.operator_org_id, idempotencyKey,
        workValueCents, clientFeeCents, operatorFeeCents, clientTotalCents, operatorNetCents, clientFeeCents + operatorFeeCents],
    )
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Milestone funding is already in progress.', 'funding_in_progress')
    throw error
  }
  try {
    const config = getConfig()
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      customer,
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

async function processCheckout(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind === 'agent_verification' && session.payment_status === 'paid') {
    await execute(`UPDATE agents SET status = 'review' WHERE id = ?`, [session.metadata.agent_id])
    await execute(
      `INSERT INTO audit_log (organization_id, action, target_type, target_id, metadata)
       VALUES (?, 'agent.verification_purchased', 'agent', ?, ?)`,
      [session.metadata.organization_id, session.metadata.agent_id, JSON.stringify({ checkoutSessionId: session.id })],
    )
    return
  }
  if (session.metadata?.kind !== 'milestone_funding' || session.payment_status !== 'paid') return
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!paymentIntentId) throw new Error('Paid checkout has no PaymentIntent')
  const paymentIntent = await stripeClient().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
  const charge = typeof paymentIntent.latest_charge === 'string' ? await stripeClient().charges.retrieve(paymentIntent.latest_charge, { expand: ['balance_transaction'] }) : paymentIntent.latest_charge
  const balanceTransaction = charge && typeof charge.balance_transaction !== 'string' ? charge.balance_transaction : null
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
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
        await execute(`UPDATE payments SET status = 'disputed' WHERE stripe_charge_id = ?`, [chargeId])
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await execute(`UPDATE payments SET status = 'refunded', refunded_at = UTC_TIMESTAMP(3) WHERE stripe_charge_id = ?`, [charge.id])
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
