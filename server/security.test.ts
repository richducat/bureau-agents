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
