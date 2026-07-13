import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import type { RowDataPacket } from 'mysql2'
import { getConfig } from './config.js'
import { execute, one, rows } from './db.js'

export interface OrganizationMembership {
  id: string
  name: string
  slug: string
  kind: 'client' | 'operator' | 'platform'
  plan: string
  memberRole: 'owner' | 'admin' | 'member' | 'billing'
}

export interface AuthenticatedUser {
  id: string
  email: string
  displayName: string
  status: string
  platformRole: 'user' | 'support' | 'admin'
  emailVerified: boolean
  organizations: OrganizationMembership[]
}

export interface AuthenticatedAgent {
  id: string
  name: string
  status: 'review' | 'active' | 'paused'
  operatorOrgId: string
  keyId: string
  scopes: string[]
}

export interface AuthenticatedClientAgent {
  organizationId: string
  organizationName: string
  createdByUserId: string
  email: string
  keyId: string
  scopes: string[]
}

interface SessionRow extends RowDataPacket {
  id: string
  email: string
  display_name: string
  status: string
  platform_role: 'user' | 'support' | 'admin'
  email_verified_at: Date | null
}

interface MembershipRow extends RowDataPacket {
  id: string
  name: string
  slug: string
  kind: 'client' | 'operator' | 'platform'
  plan: string
  member_role: 'owner' | 'admin' | 'member' | 'billing'
}

interface AgentKeyRow extends RowDataPacket {
  key_id: string
  agent_id: string
  agent_name: string
  agent_status: 'review' | 'active' | 'paused'
  operator_org_id: string
  scopes: string | string[]
}

interface ClientKeyRow extends RowDataPacket {
  key_id: string
  organization_id: string
  organization_name: string
  created_by_user_id: string
  email: string
  scopes: string | string[]
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'request_error') {
    super(message)
  }
}

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

export function createOpaqueToken(byteLength = 32) {
  return randomBytes(byteLength).toString('base64url')
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

function cookieOptions(httpOnly: boolean) {
  const config = getConfig()
  return {
    httpOnly,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: '/',
  }
}

export function issueCsrfToken(_req: Request, res: Response) {
  const config = getConfig()
  const nonce = createOpaqueToken(24)
  const signature = createHmac('sha256', config.CSRF_SECRET).update(nonce).digest('base64url')
  const token = `${nonce}.${signature}`
  res.cookie('bureau_csrf', token, { ...cookieOptions(false), maxAge: 2 * 60 * 60 * 1000 })
  return token
}

function equalStrings(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function validCsrfToken(token: string) {
  const [nonce, signature, ...rest] = token.split('.')
  if (!nonce || !signature || rest.length) return false
  const expected = createHmac('sha256', getConfig().CSRF_SECRET).update(nonce).digest('base64url')
  return equalStrings(signature, expected)
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const cookieToken = typeof req.cookies?.bureau_csrf === 'string' ? req.cookies.bureau_csrf : ''
  const headerToken = req.get('x-csrf-token') ?? ''
  if (!cookieToken || !headerToken || !equalStrings(cookieToken, headerToken) || !validCsrfToken(cookieToken)) {
    return next(new HttpError(403, 'Security token is missing or expired. Refresh and try again.', 'csrf_failed'))
  }
  next()
}

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const config = getConfig()
  const origin = req.get('origin')
  if (origin && !config.allowedOrigins.has(origin)) {
    return next(new HttpError(403, 'Request origin is not allowed.', 'origin_rejected'))
  }
  const fetchSite = req.get('sec-fetch-site')
  if (fetchSite === 'cross-site') return next(new HttpError(403, 'Cross-site request rejected.', 'origin_rejected'))
  next()
}

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[getConfig().SESSION_COOKIE_NAME]
    if (typeof token !== 'string' || token.length < 32) return next()
    const session = await one<SessionRow>(
      `SELECT u.id, u.email, u.display_name, u.status, u.platform_role, u.email_verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.status IN ('pending','active')`,
      [sha256(token)],
    )
    if (!session) return next()
    const memberships = await rows<MembershipRow>(
      `SELECT o.id, o.name, o.slug, o.kind, o.plan, om.member_role
       FROM organization_members om JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = ? AND o.status = 'active'`,
      [session.id],
    )
    req.authUser = {
      id: session.id,
      email: session.email,
      displayName: session.display_name,
      status: session.status,
      platformRole: session.platform_role,
      emailVerified: Boolean(session.email_verified_at),
      organizations: memberships.map((membership) => ({
        id: membership.id,
        name: membership.name,
        slug: membership.slug,
        kind: membership.kind,
        plan: membership.plan,
        memberRole: membership.member_role,
      })),
    }
    void execute('UPDATE sessions SET last_seen_at = UTC_TIMESTAMP(3) WHERE token_hash = ?', [sha256(token)])
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.authUser) return next(new HttpError(401, 'Sign in is required.', 'authentication_required'))
  next()
}

export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (!req.authUser?.emailVerified) return next(new HttpError(403, 'Verify your email before continuing.', 'email_verification_required'))
  next()
}

export function requirePlatformRole(...roles: AuthenticatedUser['platformRole'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser || !roles.includes(req.authUser.platformRole)) {
      return next(new HttpError(403, 'You do not have permission for this action.', 'permission_denied'))
    }
    next()
  }
}

export function membershipFor(req: Request, organizationId: string, roles?: OrganizationMembership['memberRole'][]) {
  const membership = req.authUser?.organizations.find((organization) => organization.id === organizationId)
  if (!membership || (roles && !roles.includes(membership.memberRole))) {
    throw new HttpError(403, 'You do not have access to this organization.', 'organization_access_denied')
  }
  return membership
}

export async function createSession(req: Request, res: Response, userId: string) {
  const token = createOpaqueToken(32)
  const config = getConfig()
  const expires = new Date(Date.now() + config.SESSION_TTL_DAYS * 86_400_000)
  await execute(
    `INSERT INTO sessions (token_hash, user_id, ip_hash, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [sha256(token), userId, req.ip ? sha256(`${config.CSRF_SECRET}:${req.ip}`) : null, (req.get('user-agent') ?? '').slice(0, 500), expires],
  )
  res.cookie(config.SESSION_COOKIE_NAME, token, {
    ...cookieOptions(true),
    expires,
  })
}

export async function destroySession(req: Request, res: Response) {
  const config = getConfig()
  const token = req.cookies?.[config.SESSION_COOKIE_NAME]
  if (typeof token === 'string') await execute('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)])
  res.clearCookie(config.SESSION_COOKIE_NAME, cookieOptions(true))
}

export async function authenticateAgent(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorization = req.get('authorization') ?? ''
    if (!authorization.startsWith('Bearer br_live_')) throw new HttpError(401, 'Valid agent API key required.', 'agent_authentication_required')
    const key = authorization.slice('Bearer '.length)
    const record = await one<AgentKeyRow>(
      `SELECT k.id AS key_id, a.id AS agent_id, a.name AS agent_name, a.status AS agent_status, a.operator_org_id, k.scopes
       FROM agent_api_keys k JOIN agents a ON a.id = k.agent_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > UTC_TIMESTAMP(3))
         AND a.status IN ('review','active','paused')`,
      [sha256(key)],
    )
    if (!record) throw new HttpError(401, 'Agent API key is invalid or revoked.', 'agent_authentication_required')
    const scopes = typeof record.scopes === 'string' ? JSON.parse(record.scopes) as string[] : record.scopes
    req.authAgent = { id: record.agent_id, name: record.agent_name, status: record.agent_status, operatorOrgId: record.operator_org_id, keyId: record.key_id, scopes }
    void execute('UPDATE agent_api_keys SET last_used_at = UTC_TIMESTAMP(3) WHERE id = ?', [record.key_id])
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAgentScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authAgent?.scopes.includes(scope) && !req.authAgent?.scopes.includes('*')) {
      return next(new HttpError(403, `Agent API key requires the ${scope} scope.`, 'agent_scope_required'))
    }
    next()
  }
}

export async function authenticateClientAgent(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorization = req.get('authorization') ?? ''
    if (!authorization.startsWith('Bearer bc_live_')) throw new HttpError(401, 'Valid client agent API key required.', 'client_agent_authentication_required')
    const key = authorization.slice('Bearer '.length)
    const record = await one<ClientKeyRow>(
      `SELECT k.id AS key_id, k.organization_id, o.name AS organization_name,
        k.created_by_user_id, u.email, k.scopes
       FROM client_api_keys k JOIN organizations o ON o.id = k.organization_id
       JOIN users u ON u.id = k.created_by_user_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > UTC_TIMESTAMP(3))
         AND o.kind = 'client' AND o.status = 'active' AND u.email_verified_at IS NOT NULL`,
      [sha256(key)],
    )
    if (!record) throw new HttpError(401, 'Client agent API key is invalid, revoked, or awaiting owner verification.', 'client_agent_authentication_required')
    const scopes = typeof record.scopes === 'string' ? JSON.parse(record.scopes) as string[] : record.scopes
    req.authClientAgent = {
      organizationId: record.organization_id,
      organizationName: record.organization_name,
      createdByUserId: record.created_by_user_id,
      email: record.email,
      keyId: record.key_id,
      scopes,
    }
    void execute('UPDATE client_api_keys SET last_used_at = UTC_TIMESTAMP(3) WHERE id = ?', [record.key_id])
    next()
  } catch (error) {
    next(error)
  }
}

export function requireClientAgentScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authClientAgent?.scopes.includes(scope) && !req.authClientAgent?.scopes.includes('*')) {
      return next(new HttpError(403, `Client agent API key requires the ${scope} scope.`, 'client_agent_scope_required'))
    }
    next()
  }
}

export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => void handler(req, res, next).catch(next)
}
