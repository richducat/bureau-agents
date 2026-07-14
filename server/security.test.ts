import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { resetConfigForTests } from './config.js'
import { decryptSecret, encryptSecret } from './crypto.js'
import { hashPassword, verifyPassword } from './security.js'
import { assertSafeWebhookUrl } from './webhooks.js'

afterEach(() => resetConfigForTests())

describe('security boundaries', () => {
  it('serves a minimal liveness response without exposing framework details', async () => {
    const response = await request(createApp()).get('/health/live').expect(200)
    expect(response.body).toEqual({ status: 'ok', service: 'bureau-api' })
    expect(response.headers['x-powered-by']).toBeUndefined()
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('serves the production agent contract without authentication', async () => {
    const response = await request(createApp()).get('/api/openapi.yaml').expect(200)
    expect(response.headers['content-type']).toContain('application/yaml')
    expect(response.text).toContain('https://api.ai.eb28.co/api')
    expect(response.text).toContain('/v1/agent/jobs')
  })

  it('publishes a fail-closed commercial status separately from infrastructure health', async () => {
    const response = await request(createApp())
      .get('/api/public/readiness')
      .set('origin', 'http://localhost:5173')
      .expect(200)
    expect(response.body.readiness).toMatchObject({
      stage: 'founding_beta',
      acceptingRequests: true,
      acceptingNewPayments: false,
    })
    expect(response.body.readiness.blockers.length).toBeGreaterThan(0)
  })

  it('rejects state changes that have no CSRF token', async () => {
    const response = await request(createApp())
      .post('/api/public/waitlist')
      .set('origin', 'http://localhost:5173')
      .send({ email: 'person@example.com', audience: 'client', consent: true })
      .expect(403)
    expect(response.body.error.code).toBe('csrf_failed')
  })

  it('rejects untrusted browser origins before route logic', async () => {
    const response = await request(createApp())
      .post('/api/public/waitlist')
      .set('origin', 'https://attacker.example')
      .send({ email: 'person@example.com', audience: 'client', consent: true })
      .expect(403)
    expect(response.body.error.code).toBe('origin_rejected')
  })

  it('rejects lookalike Upwork hosts before any agent or database lookup', async () => {
    const browser = request.agent(createApp())
    const csrf = await browser.get('/api/auth/csrf').set('origin', 'http://localhost:5173').expect(200)
    const response = await browser
      .post('/api/public/upwork-quotes/preview')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', csrf.body.csrfToken)
      .send({
        jobUrl: 'https://upwork.com.attacker.example/jobs/~0123456789',
        serviceId: 'website-fix',
        scopeUnits: 1,
      })
      .expect(400)
    expect(response.body.error.code).toBe('invalid_upwork_job_url')
  })

  it('rejects buyer-supplied comparison prices at the public quote boundary', async () => {
    const browser = request.agent(createApp())
    const csrf = await browser.get('/api/auth/csrf').set('origin', 'http://localhost:5173').expect(200)
    const response = await browser
      .post('/api/public/upwork-quotes/preview')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', csrf.body.csrfToken)
      .send({
        jobUrl: 'https://www.upwork.com/jobs/~0123456789',
        serviceId: 'website-fix',
        scopeUnits: 1,
        referenceType: 'posted_budget',
        referenceAmountCents: 50_000,
      })
      .expect(400)
    expect(response.body.error.code).toBe('validation_failed')

    const submission = await browser
      .post('/api/public/upwork-quotes')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', csrf.body.csrfToken)
      .send({
        jobUrl: 'https://www.upwork.com/jobs/~0123456789',
        serviceId: 'website-fix',
        scopeUnits: 1,
        referenceAmountCents: 50_000,
        contactName: 'Fair Buyer',
        email: 'fair@example.com',
        title: 'Repair the production checkout',
        details: 'Repair the reproducible checkout issue, verify the fix with tests, and provide a concise deployment record for review.',
        desiredTiming: 'Flexible',
        authorizationAttested: true,
        catalogScopeAttested: true,
        consent: true,
      })
      .expect(400)
    expect(submission.body.error.code).toBe('validation_failed')
  })

  it('hashes passwords and never accepts the plaintext as a hash', async () => {
    const hash = await hashPassword('CorrectHorseBattery9')
    expect(hash).not.toContain('CorrectHorseBattery9')
    expect(await verifyPassword('CorrectHorseBattery9', hash)).toBe(true)
    expect(await verifyPassword('IncorrectHorseBattery9', hash)).toBe(false)
  })

  it('encrypts operational secrets with authenticated encryption', () => {
    process.env.DATA_ENCRYPTION_KEY = '11'.repeat(32)
    resetConfigForTests()
    const ciphertext = encryptSecret('whsec_example-secret')
    expect(ciphertext).not.toContain('example-secret')
    expect(decryptSecret(ciphertext)).toBe('whsec_example-secret')
    delete process.env.DATA_ENCRYPTION_KEY
  })

  it('blocks private webhook destinations', async () => {
    await expect(assertSafeWebhookUrl('http://example.com/webhook')).rejects.toThrow('HTTPS')
    await expect(assertSafeWebhookUrl('https://127.0.0.1/webhook')).rejects.toThrow('private')
    await expect(assertSafeWebhookUrl('https://localhost/webhook')).rejects.toThrow('not allowed')
  })
})
