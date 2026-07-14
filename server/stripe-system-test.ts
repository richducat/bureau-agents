import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { RowDataPacket } from 'mysql2'

type JsonObject = Record<string, unknown>

interface PaymentRow extends RowDataPacket {
  id: string
  status: string
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  stripe_transfer_id: string | null
  client_total_cents: number
  operator_net_cents: number
}

interface StateRow extends RowDataPacket {
  payment_status: string
  milestone_status: string
  contract_status: string
  dispute_status: string | null
}

interface OrganizationRow extends RowDataPacket {
  stripe_customer_id: string | null
}

interface CountRow extends RowDataPacket {
  count: number
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown system-test failure'
}

function requireTestKey(value: string | undefined) {
  if (!value || !value.startsWith('sk_test_')) {
    throw new Error('STRIPE_TEST_SECRET_KEY must be a Stripe test-mode secret key')
  }
  return value
}

async function main() {
  if (process.env.BUREAU_STRIPE_SYSTEM_TEST !== '1') {
    throw new Error('BUREAU_STRIPE_SYSTEM_TEST=1 is required')
  }

  try {
    process.loadEnvFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const expectedAppOrigin = process.env.BUREAU_EXPECTED_APP_ORIGIN
  if (!expectedAppOrigin || process.env.APP_ORIGIN !== expectedAppOrigin) {
    throw new Error('The deployed APP_ORIGIN does not match BUREAU_EXPECTED_APP_ORIGIN')
  }

  const stripeTestKey = requireTestKey(process.env.STRIPE_TEST_SECRET_KEY)
  const browserOrigin = 'http://127.0.0.1:5173'
  const webhookSecret = `whsec_bureau_system_test_${randomBytes(24).toString('hex')}`
  process.env.NODE_ENV = 'test'
  process.env.APP_ORIGIN = browserOrigin
  process.env.API_ORIGIN = 'http://127.0.0.1'
  process.env.ALLOWED_ORIGINS = browserOrigin
  process.env.STRIPE_SECRET_KEY = stripeTestKey
  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret
  process.env.LEGAL_REVIEW_COMPLETED = 'true'
  process.env.TAX_REVIEW_COMPLETED = 'true'
  process.env.COMMERCIAL_PAYMENTS_ENABLED = 'true'
  process.env.MILESTONE_PAYMENT_PILOT_ENABLED = 'true'

  const [{ createApp }, database, { getConfig }, { stripeClient }] = await Promise.all([
    import('./app.js'),
    import('./db.js'),
    import('./config.js'),
    import('./stripe.js'),
  ])
  const { closePool, one, transaction } = database
  const config = getConfig()
  const stripe = stripeClient()

  const runId = randomUUID()
  const runTag = runId.replaceAll('-', '').slice(0, 20)
  const ids = {
    user: randomUUID(),
    clientOrganization: randomUUID(),
    operatorOrganization: randomUUID(),
    agent: randomUUID(),
    contract: randomUUID(),
    milestone: randomUUID(),
    deliverable: '',
    dispute: '',
  }
  const eventIds = {
    checkout: `evt_bureau_checkout_${runTag}`,
    processorDispute: `evt_bureau_dispute_${runTag}`,
  }
  const checks: Record<string, boolean> = {
    connectedAccountReady: false,
    checkoutSessionCreated: false,
    testCardPaymentSucceeded: false,
    signedWebhookReconciled: false,
    webhookIdempotencyVerified: false,
    deliverableSubmitted: false,
    operatorTransferCreated: false,
    disputeWebhookProcessed: false,
    bureauDisputeResolved: false,
    transferReversed: false,
    clientRefundSucceeded: false,
    actualProcessorDisputeCreated: false,
    databaseStateVerified: false,
    databaseFixturesRemoved: false,
    stripeFixturesRemoved: false,
  }

  let server: Server | undefined
  let localOrigin = ''
  let connectedAccountId = ''
  let customerId = ''
  let checkoutSessionId = ''
  let paymentIntentId = ''
  let chargeId = ''
  let transferId = ''
  let processorDisputePaymentIntentId = ''
  let csrfToken = ''
  let sessionCookie = ''
  let failure: unknown
  const cleanupErrors: string[] = []

  async function api<T extends JsonObject>(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    headers.set('origin', browserOrigin)
    headers.set('cookie', sessionCookie)
    if (init.method && !['GET', 'HEAD'].includes(init.method)) {
      headers.set('x-csrf-token', csrfToken)
    }
    const response = await fetch(`${localOrigin}${path}`, { ...init, headers })
    const body = await response.json() as T
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body).slice(0, 500)}`)
    return body
  }

  async function signedWebhook(payloadObject: JsonObject) {
    const payload = JSON.stringify(payloadObject)
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
    const response = await fetch(`${localOrigin}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      body: payload,
    })
    const body = await response.json() as JsonObject
    if (!response.ok) throw new Error(`Signed webhook returned ${response.status}: ${JSON.stringify(body).slice(0, 500)}`)
    return body
  }

  async function removeDatabaseFixtures() {
    await transaction(async (connection) => {
      await connection.execute(
        `DELETE FROM audit_log
         WHERE actor_user_id = ? OR actor_agent_id = ? OR organization_id IN (?, ?)
           OR target_id IN (?, ?, ?, ?, ?)`,
        [ids.user, ids.agent, ids.clientOrganization, ids.operatorOrganization, ids.contract, ids.milestone, ids.deliverable || 'none', ids.dispute || 'none', runId],
      )
      await connection.execute('DELETE FROM webhook_events WHERE provider = ? AND external_id IN (?, ?)', ['stripe', eventIds.checkout, eventIds.processorDispute])
      await connection.execute('DELETE FROM webhook_deliveries WHERE agent_id = ?', [ids.agent])
      await connection.execute('DELETE FROM reviews WHERE contract_id = ?', [ids.contract])
      await connection.execute('DELETE FROM messages WHERE contract_id = ?', [ids.contract])
      await connection.execute('DELETE FROM disputes WHERE contract_id = ?', [ids.contract])
      await connection.execute('DELETE FROM deliverables WHERE milestone_id = ?', [ids.milestone])
      await connection.execute('DELETE FROM payment_stripe_exposure_events WHERE payment_id IN (SELECT id FROM payments WHERE milestone_id = ?)', [ids.milestone])
      await connection.execute('DELETE FROM payments WHERE milestone_id = ?', [ids.milestone])
      await connection.execute('DELETE FROM milestones WHERE contract_id = ?', [ids.contract])
      await connection.execute('DELETE FROM contracts WHERE id = ?', [ids.contract])
      await connection.execute('DELETE FROM saved_agents WHERE agent_id = ? OR user_id = ?', [ids.agent, ids.user])
      await connection.execute('DELETE FROM agent_heartbeats WHERE agent_id = ?', [ids.agent])
      await connection.execute('DELETE FROM agent_api_keys WHERE agent_id = ?', [ids.agent])
      await connection.execute('DELETE FROM agent_capabilities WHERE agent_id = ?', [ids.agent])
      await connection.execute('DELETE FROM agent_policies WHERE agent_id = ?', [ids.agent])
      await connection.execute('DELETE FROM agents WHERE id = ?', [ids.agent])
      await connection.execute('DELETE FROM client_api_keys WHERE organization_id IN (?, ?) OR created_by_user_id = ?', [ids.clientOrganization, ids.operatorOrganization, ids.user])
      await connection.execute('DELETE FROM subscriptions WHERE organization_id IN (?, ?)', [ids.clientOrganization, ids.operatorOrganization])
      await connection.execute('DELETE FROM support_requests WHERE user_id = ?', [ids.user])
      await connection.execute('DELETE FROM task_requests WHERE user_id = ? OR client_org_id IN (?, ?)', [ids.user, ids.clientOrganization, ids.operatorOrganization])
      await connection.execute('DELETE FROM analytics_events WHERE user_id = ? OR organization_id IN (?, ?)', [ids.user, ids.clientOrganization, ids.operatorOrganization])
      await connection.execute('DELETE FROM identity_tokens WHERE user_id = ?', [ids.user])
      await connection.execute('DELETE FROM sessions WHERE user_id = ?', [ids.user])
      await connection.execute('DELETE FROM organization_members WHERE user_id = ? OR organization_id IN (?, ?)', [ids.user, ids.clientOrganization, ids.operatorOrganization])
      await connection.execute('DELETE FROM organizations WHERE id IN (?, ?)', [ids.clientOrganization, ids.operatorOrganization])
      await connection.execute('DELETE FROM users WHERE id = ?', [ids.user])
    })
    const residue = await one<CountRow>(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE id = ?) +
        (SELECT COUNT(*) FROM organizations WHERE id IN (?, ?)) +
        (SELECT COUNT(*) FROM agents WHERE id = ?) +
        (SELECT COUNT(*) FROM contracts WHERE id = ?) +
        (SELECT COUNT(*) FROM milestones WHERE id = ?) AS count`,
      [ids.user, ids.clientOrganization, ids.operatorOrganization, ids.agent, ids.contract, ids.milestone],
    )
    assert.equal(Number(residue?.count ?? -1), 0)
    checks.databaseFixturesRemoved = true
  }

  async function removeStripeFixtures() {
    if (transferId) {
      const transfer = await stripe.transfers.retrieve(transferId)
      const remaining = transfer.amount - transfer.amount_reversed
      if (remaining > 0) {
        await stripe.transfers.createReversal(transferId, { amount: remaining }, { idempotencyKey: `qa_cleanup_reverse_${runTag}` })
      }
    }
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId)
      const remaining = charge.amount - charge.amount_refunded
      if (remaining > 0 && !charge.disputed) {
        await stripe.refunds.create({ charge: chargeId, amount: remaining }, { idempotencyKey: `qa_cleanup_refund_${runTag}` })
      }
    }
    if (checkoutSessionId) {
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId)
      if (session.status === 'open') await stripe.checkout.sessions.expire(checkoutSessionId)
    }
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId)
      if (!customer.deleted) await stripe.customers.del(customerId)
    }
    if (connectedAccountId) {
      const account = await stripe.accounts.retrieve(connectedAccountId)
      if (!account.deleted) await stripe.accounts.del(connectedAccountId)
    }
    checks.stripeFixturesRemoved = true
  }

  try {
    const platform = await one<CountRow>(
      `SELECT COUNT(*) AS count FROM organizations
       WHERE id = '00000000-0000-4000-8000-000000000001' AND kind = 'platform'`,
    )
    assert.equal(Number(platform?.count ?? 0), 1, 'Bureau production schema marker is missing')

    const accountEmail = `bureau-system-test-${runTag}@example.com`
    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'US',
      email: accountEmail,
      business_type: 'individual',
      business_profile: {
        mcc: '5734',
        product_description: 'AI work marketplace system test',
        url: 'https://accessible.stripe.com',
      },
      capabilities: { transfers: { requested: true } },
      individual: {
        first_name: 'Jenny',
        last_name: 'Rosen',
        email: accountEmail,
        phone: '0000000000',
        dob: { day: 1, month: 1, year: 1902 },
        address: {
          line1: 'address_full_match',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94103',
          country: 'US',
        },
        ssn_last_4: '0000',
      },
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
      metadata: { bureau_system_test: 'true', bureau_run_id: runId },
    }, { idempotencyKey: `qa_account_${runTag}` })
    connectedAccountId = account.id
    await stripe.accounts.createExternalAccount(connectedAccountId, { external_account: 'btok_us_verified' })
    const connectedAccount = await stripe.accounts.retrieve(connectedAccountId)
    assert.equal(connectedAccount.capabilities?.transfers, 'active')
    assert.equal(connectedAccount.payouts_enabled, true)
    assert.deepEqual(connectedAccount.requirements?.currently_due ?? [], [])
    checks.connectedAccountReady = true

    const rawSessionToken = randomBytes(32).toString('base64url')
    await transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO users (id, email, password_hash, display_name, status, platform_role, email_verified_at)
         VALUES (?, ?, ?, ?, 'active', 'admin', UTC_TIMESTAMP(3))`,
        [ids.user, `qa+${runTag}@bureau.invalid`, 'not-used-system-test', 'Bureau Stripe QA'],
      )
      await connection.execute(
        `INSERT INTO organizations (id, name, slug, kind, plan, status)
         VALUES (?, 'Bureau QA Buyer', ?, 'client', 'client_starter', 'active')`,
        [ids.clientOrganization, `bureau-qa-buyer-${runTag}`],
      )
      await connection.execute(
        `INSERT INTO organizations
         (id, name, slug, kind, plan, status, stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled)
         VALUES (?, 'Bureau QA Operator', ?, 'operator', 'operator_starter', 'active', ?, TRUE, TRUE)`,
        [ids.operatorOrganization, `bureau-qa-operator-${runTag}`, connectedAccountId],
      )
      await connection.execute(
        `INSERT INTO organization_members (organization_id, user_id, member_role)
         VALUES (?, ?, 'owner'), (?, ?, 'owner')`,
        [ids.clientOrganization, ids.user, ids.operatorOrganization, ids.user],
      )
      await connection.execute(
        `INSERT INTO sessions (token_hash, user_id, user_agent, expires_at)
         VALUES (?, ?, 'bureau-stripe-system-test', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR))`,
        [digest(rawSessionToken), ids.user],
      )
      await connection.execute(
        `INSERT INTO agents
         (id, operator_org_id, slug, name, tagline, description, category, status, verification_level,
          autonomy_level, pricing_model, base_price_cents, terms_accepted_at, published_at)
         VALUES (?, ?, ?, 'Bureau QA Agent', 'Stripe system-test operator',
          'Ephemeral agent fixture for the isolated Stripe sandbox system test.', 'Engineering', 'active',
          'capability', 'supervised', 'fixed', 1000, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
        [ids.agent, ids.operatorOrganization, `bureau-qa-agent-${runTag}`],
      )
      await connection.execute(
        `INSERT INTO contracts
         (id, client_org_id, operator_org_id, agent_id, title, scope, total_work_value_cents,
          client_fee_basis_points, operator_fee_basis_points, status)
         VALUES (?, ?, ?, ?, 'Bureau Stripe system test', 'Ephemeral sandbox-only milestone.', 1000, 500, 1000, 'pending_funding')`,
        [ids.contract, ids.clientOrganization, ids.operatorOrganization, ids.agent],
      )
      await connection.execute(
        `INSERT INTO milestones (id, contract_id, sequence_number, title, description, work_value_cents)
         VALUES (?, ?, 1, 'Sandbox milestone', 'Funds, delivers, releases, disputes, reverses, and refunds in test mode.', 1000)`,
        [ids.milestone, ids.contract],
      )
    })

    const app = createApp()
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
      listener.once('error', reject)
    })
    localOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const csrfResponse = await fetch(`${localOrigin}/api/auth/csrf`, {
      headers: { cookie: `${config.SESSION_COOKIE_NAME}=${rawSessionToken}` },
    })
    assert.equal(csrfResponse.ok, true)
    const csrfBody = await csrfResponse.json() as { csrfToken: string }
    csrfToken = csrfBody.csrfToken
    sessionCookie = `${config.SESSION_COOKIE_NAME}=${rawSessionToken}; bureau_csrf=${csrfToken}`

    const checkout = await api<{
      checkoutUrl: string
      paymentId: string
      economics: { clientTotalCents: number; operatorNetCents: number }
    }>(`/api/billing/milestones/${ids.milestone}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': `qa-funding-${runTag}` },
      body: '{}',
    })
    assert.match(checkout.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//)
    const payment = await one<PaymentRow>('SELECT * FROM payments WHERE id = ?', [checkout.paymentId])
    assert.ok(payment?.stripe_checkout_session_id)
    checkoutSessionId = payment.stripe_checkout_session_id
    checks.checkoutSessionCreated = true

    const clientOrganization = await one<OrganizationRow>('SELECT stripe_customer_id FROM organizations WHERE id = ?', [ids.clientOrganization])
    assert.ok(clientOrganization?.stripe_customer_id)
    customerId = clientOrganization.stripe_customer_id

    const paymentIntent = await stripe.paymentIntents.create({
      amount: checkout.economics.clientTotalCents,
      currency: 'usd',
      customer: customerId,
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
      confirm: true,
      transfer_group: `bureau_contract_${ids.contract}`,
      metadata: {
        bureau_payment_id: checkout.paymentId,
        bureau_milestone_id: ids.milestone,
        bureau_contract_id: ids.contract,
        bureau_system_test: 'true',
      },
    }, { idempotencyKey: `qa_payment_intent_${runTag}` })
    assert.equal(paymentIntent.status, 'succeeded')
    paymentIntentId = paymentIntent.id
    chargeId = typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id ?? ''
    assert.ok(chargeId)
    checks.testCardPaymentSucceeded = true

    const checkoutEvent = {
      id: eventIds.checkout,
      object: 'event',
      api_version: '2026-06-24.dahlia',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: checkoutSessionId,
          object: 'checkout.session',
          livemode: false,
          metadata: {
            kind: 'milestone_funding',
            payment_id: checkout.paymentId,
            milestone_id: ids.milestone,
            contract_id: ids.contract,
          },
          payment_intent: paymentIntentId,
          payment_status: 'paid',
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
    }
    const firstWebhook = await signedWebhook(checkoutEvent)
    assert.equal(firstWebhook.received, true)
    checks.signedWebhookReconciled = true
    const duplicateWebhook = await signedWebhook(checkoutEvent)
    assert.equal(duplicateWebhook.duplicate, true)
    checks.webhookIdempotencyVerified = true

    const funded = await one<StateRow>(
      `SELECT p.status AS payment_status, m.status AS milestone_status, c.status AS contract_status, NULL AS dispute_status
       FROM payments p JOIN milestones m ON m.id = p.milestone_id JOIN contracts c ON c.id = m.contract_id
       WHERE p.id = ?`,
      [checkout.paymentId],
    )
    assert.equal(funded?.payment_status, 'paid')
    assert.equal(funded?.milestone_status, 'funded')
    assert.equal(funded?.contract_status, 'active')

    const deliverable = await api<{ deliverable: { id: string }; milestoneStatus: string }>(
      `/api/marketplace/milestones/${ids.milestone}/deliverables`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Verified sandbox deliverable',
          description: 'Ephemeral evidence used only to verify the Bureau payment and approval workflow.',
          artifactUrl: null,
          artifactSha256: null,
        }),
      },
    )
    ids.deliverable = deliverable.deliverable.id
    assert.equal(deliverable.milestoneStatus, 'submitted')
    checks.deliverableSubmitted = true

    const approval = await api<{ released: boolean; transferId: string; operatorNetCents: number }>(
      `/api/billing/milestones/${ids.milestone}/approve`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    )
    assert.equal(approval.released, true)
    assert.ok(approval.transferId)
    transferId = approval.transferId
    const transfer = await stripe.transfers.retrieve(transferId)
    assert.equal(transfer.destination, connectedAccountId)
    assert.equal(transfer.amount, checkout.economics.operatorNetCents)
    assert.equal(transfer.source_transaction, chargeId)
    checks.operatorTransferCreated = true

    const disputeEvent = {
      id: eventIds.processorDispute,
      object: 'event',
      api_version: '2026-06-24.dahlia',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: `dp_bureau_${runTag}`, object: 'dispute', charge: chargeId, livemode: false } },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'charge.dispute.created',
    }
    const disputeWebhook = await signedWebhook(disputeEvent)
    assert.equal(disputeWebhook.received, true)
    const processorMarked = await one<PaymentRow>('SELECT * FROM payments WHERE id = ?', [checkout.paymentId])
    assert.equal(processorMarked?.status, 'disputed')
    checks.disputeWebhookProcessed = true

    const bureauDispute = await api<{ dispute: { id: string; status: string } }>(
      `/api/marketplace/contracts/${ids.contract}/disputes`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          milestoneId: ids.milestone,
          reason: 'quality',
          statement: 'Sandbox-only dispute used to verify supervised client protection and the full refund workflow.',
        }),
      },
    )
    ids.dispute = bureauDispute.dispute.id
    assert.equal(bureauDispute.dispute.status, 'open')

    const resolution = await api<{ dispute: { id: string; status: string }; transferId: string; refundId: string }>(
      `/api/admin/disputes/${ids.dispute}/resolve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resolution: 'client_refund',
          note: 'Sandbox system-test resolution: reverse the operator transfer and refund the client in full.',
        }),
      },
    )
    assert.equal(resolution.dispute.status, 'resolved_client')
    assert.ok(resolution.refundId)
    checks.bureauDisputeResolved = true

    const reversedTransfer = await stripe.transfers.retrieve(transferId)
    assert.equal(reversedTransfer.reversed, true)
    assert.equal(reversedTransfer.amount_reversed, reversedTransfer.amount)
    checks.transferReversed = true
    const refundedCharge = await stripe.charges.retrieve(chargeId)
    assert.equal(refundedCharge.refunded, true)
    assert.equal(refundedCharge.amount_refunded, refundedCharge.amount)
    checks.clientRefundSucceeded = true

    const processorDisputeIntent = await stripe.paymentIntents.create({
      amount: 500,
      currency: 'usd',
      payment_method: 'pm_card_createDispute',
      payment_method_types: ['card'],
      confirm: true,
      metadata: { bureau_system_test: 'true', bureau_run_id: runId, purpose: 'processor_dispute_probe' },
    }, { idempotencyKey: `qa_processor_dispute_${runTag}` })
    processorDisputePaymentIntentId = processorDisputeIntent.id
    assert.equal(processorDisputeIntent.status, 'succeeded')
    const processorDisputeChargeId = typeof processorDisputeIntent.latest_charge === 'string'
      ? processorDisputeIntent.latest_charge
      : processorDisputeIntent.latest_charge?.id ?? ''
    assert.ok(processorDisputeChargeId)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const processorCharge = await stripe.charges.retrieve(processorDisputeChargeId)
      if (processorCharge.disputed) {
        checks.actualProcessorDisputeCreated = true
        break
      }
      await delay(1_000)
    }
    assert.equal(checks.actualProcessorDisputeCreated, true, 'Stripe did not create the expected sandbox dispute')

    const finalState = await one<StateRow>(
      `SELECT p.status AS payment_status, m.status AS milestone_status, c.status AS contract_status,
        d.status AS dispute_status
       FROM payments p JOIN milestones m ON m.id = p.milestone_id JOIN contracts c ON c.id = m.contract_id
       JOIN disputes d ON d.milestone_id = m.id WHERE p.id = ? AND d.id = ?`,
      [checkout.paymentId, ids.dispute],
    )
    assert.equal(finalState?.payment_status, 'refunded')
    assert.equal(finalState?.milestone_status, 'refunded')
    assert.equal(finalState?.contract_status, 'active')
    assert.equal(finalState?.dispute_status, 'resolved_client')
    const processedEvents = await one<CountRow>(
      `SELECT COUNT(*) AS count FROM webhook_events
       WHERE provider = 'stripe' AND external_id IN (?, ?) AND status = 'processed'`,
      [eventIds.checkout, eventIds.processorDispute],
    )
    assert.equal(Number(processedEvents?.count ?? 0), 2)
    checks.databaseStateVerified = true
  } catch (error) {
    failure = error
  } finally {
    if (server) {
      try {
        await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
      } catch (error) {
        cleanupErrors.push(`server: ${errorMessage(error)}`)
      }
    }
    try {
      await removeStripeFixtures()
    } catch (error) {
      cleanupErrors.push(`stripe: ${errorMessage(error)}`)
    }
    try {
      await removeDatabaseFixtures()
    } catch (error) {
      cleanupErrors.push(`database: ${errorMessage(error)}`)
    }
    try {
      await closePool()
    } catch (error) {
      cleanupErrors.push(`pool: ${errorMessage(error)}`)
    }
  }

  if (cleanupErrors.length) throw new Error(`System-test cleanup failed: ${cleanupErrors.join('; ')}`)
  if (failure) throw failure
  assert.equal(Object.values(checks).every(Boolean), true)

  console.log(JSON.stringify({
    ok: true,
    mode: 'test',
    runId,
    completedAt: new Date().toISOString(),
    immutableTestPaymentIntents: [paymentIntentId, processorDisputePaymentIntentId].filter(Boolean).length,
    checks,
  }))
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: errorMessage(error) }))
  process.exitCode = 1
})
