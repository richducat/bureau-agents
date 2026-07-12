import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { execute, one, transaction } from '../db.js'
import { sendEmailVerification, sendPasswordReset } from '../mailer.js'
import {
  asyncRoute,
  createOpaqueToken,
  createSession,
  destroySession,
  hashPassword,
  HttpError,
  issueCsrfToken,
  requireAuth,
  sha256,
  verifyPassword,
} from '../security.js'

interface UserRow extends RowDataPacket {
  id: string
  email: string
  display_name: string
  password_hash: string
  status: string
}

const password = z.string().min(12).max(128).refine(
  (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
  'Password must include uppercase, lowercase, and a number',
)

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password,
  displayName: z.string().trim().min(2).max(120),
  accountType: z.enum(['client', 'operator']),
  organizationName: z.string().trim().min(2).max(160),
  termsAccepted: z.literal(true),
})

function slugify(value: string) {
  const base = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150)
  return `${base || 'organization'}-${randomUUID().slice(0, 8)}`
}

export const authRouter = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Try again later.' } },
})

authRouter.get('/csrf', (req, res) => {
  res.json({ csrfToken: issueCsrfToken(req, res) })
})

authRouter.post('/signup', authLimiter, asyncRoute(async (req, res) => {
  const input = signupSchema.parse(req.body)
  const existing = await one<UserRow>('SELECT id FROM users WHERE email = ?', [input.email])
  if (existing) throw new HttpError(409, 'An account already exists for that email.', 'account_exists')

  const userId = randomUUID()
  const organizationId = randomUUID()
  const verificationToken = createOpaqueToken()
  const passwordHash = await hashPassword(input.password)
  const config = getConfig()
  const platformRole = config.adminEmails.has(input.email) ? 'admin' : 'user'
  const organizationPlan = input.accountType === 'client' ? 'client_starter' : 'operator_starter'

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO users (id, email, password_hash, display_name, platform_role)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, input.email, passwordHash, input.displayName, platformRole],
    )
    await connection.execute(
      `INSERT INTO organizations (id, name, slug, kind, plan) VALUES (?, ?, ?, ?, ?)`,
      [organizationId, input.organizationName, slugify(input.organizationName), input.accountType, organizationPlan],
    )
    await connection.execute(
      `INSERT INTO organization_members (organization_id, user_id, member_role) VALUES (?, ?, 'owner')`,
      [organizationId, userId],
    )
    await connection.execute(
      `INSERT INTO identity_tokens (token_hash, user_id, purpose, expires_at)
       VALUES (?, ?, 'verify_email', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 24 HOUR))`,
      [sha256(verificationToken), userId],
    )
    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, organization_id, action, target_type, target_id)
       VALUES (?, ?, 'account.created', 'user', ?)`,
      [userId, organizationId, userId],
    )
  })

  await createSession(req, res, userId)
  const emailDelivered = await sendEmailVerification(input.email, input.displayName, verificationToken)
  res.status(201).json({
    user: { id: userId, email: input.email, displayName: input.displayName, emailVerified: false },
    organization: { id: organizationId, name: input.organizationName, kind: input.accountType, plan: organizationPlan },
    emailDelivered,
  })
}))

authRouter.post('/verify-email', authLimiter, asyncRoute(async (req, res) => {
  const { token } = z.object({ token: z.string().min(32).max(200) }).parse(req.body)
  const result = await transaction(async (connection) => {
    const [tokens] = await connection.execute<RowDataPacket[]>(
      `SELECT user_id FROM identity_tokens
       WHERE token_hash = ? AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)
       FOR UPDATE`,
      [sha256(token)],
    )
    const record = tokens[0] as { user_id: string } | undefined
    if (!record) return false
    await connection.execute('UPDATE identity_tokens SET used_at = UTC_TIMESTAMP(3) WHERE token_hash = ?', [sha256(token)])
    await connection.execute(
      `UPDATE users SET email_verified_at = UTC_TIMESTAMP(3), status = 'active' WHERE id = ?`,
      [record.user_id],
    )
    return true
  })
  if (!result) throw new HttpError(400, 'Verification link is invalid or expired.', 'invalid_token')
  res.json({ verified: true })
}))

authRouter.post('/login', authLimiter, asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().max(128) }).parse(req.body)
  const user = await one<UserRow>(
    `SELECT id, email, display_name, password_hash, status FROM users WHERE email = ?`,
    [input.email],
  )
  const valid = user ? await verifyPassword(input.password, user.password_hash) : await verifyPassword(input.password, '$2b$12$xJr9jzzPDxXr64M4Q4NqNuU8X8zE0kY0R.0kD/mJfP7l9QPYxqipK')
  if (!user || !valid || ['suspended', 'deleted'].includes(user.status)) {
    throw new HttpError(401, 'Email or password is incorrect.', 'invalid_credentials')
  }
  await createSession(req, res, user.id)
  await execute('UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [user.id])
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name } })
}))

authRouter.post('/logout', requireAuth, asyncRoute(async (req, res) => {
  await destroySession(req, res)
  res.status(204).end()
}))

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.authUser })
})

authRouter.post('/forgot-password', authLimiter, asyncRoute(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body)
  const user = await one<UserRow>('SELECT id, email, display_name FROM users WHERE email = ? AND status <> \'deleted\'', [email])
  if (user) {
    const token = createOpaqueToken()
    await execute(`UPDATE identity_tokens SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND purpose = 'reset_password' AND used_at IS NULL`, [user.id])
    await execute(
      `INSERT INTO identity_tokens (token_hash, user_id, purpose, expires_at)
       VALUES (?, ?, 'reset_password', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR))`,
      [sha256(token), user.id],
    )
    await sendPasswordReset(user.email, user.display_name, token)
  }
  res.status(202).json({ accepted: true })
}))

authRouter.post('/reset-password', authLimiter, asyncRoute(async (req, res) => {
  const { token, newPassword } = z.object({ token: z.string().min(32).max(200), newPassword: password }).parse(req.body)
  const passwordHash = await hashPassword(newPassword)
  const reset = await transaction(async (connection) => {
    const [tokens] = await connection.execute<RowDataPacket[]>(
      `SELECT user_id FROM identity_tokens
       WHERE token_hash = ? AND purpose = 'reset_password' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE`,
      [sha256(token)],
    )
    const record = tokens[0] as { user_id: string } | undefined
    if (!record) return false
    await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, record.user_id])
    await connection.execute('UPDATE identity_tokens SET used_at = UTC_TIMESTAMP(3) WHERE token_hash = ?', [sha256(token)])
    await connection.execute<ResultSetHeader>('DELETE FROM sessions WHERE user_id = ?', [record.user_id])
    return true
  })
  if (!reset) throw new HttpError(400, 'Reset link is invalid or expired.', 'invalid_token')
  res.json({ reset: true })
}))
