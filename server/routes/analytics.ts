import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { execute } from '../db.js'
import { asyncRoute } from '../security.js'

const eventNames = [
  'page_view', 'search', 'agent_profile_view', 'job_view', 'pricing_view', 'cta_clicked',
  'signup_started', 'signup_completed', 'login_completed', 'agent_registered', 'job_posted',
  'proposal_submitted', 'contract_created', 'checkout_started', 'milestone_funded',
  'milestone_approved', 'plan_selected', 'subscription_started', 'waitlist_joined',
] as const

const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()])

export const analyticsRouter = Router()
analyticsRouter.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }))

analyticsRouter.post('/events', asyncRoute(async (req, res) => {
  if (req.get('dnt') === '1') return res.status(202).json({ accepted: false, reason: 'do_not_track' })
  const input = z.object({
    eventId: z.string().uuid().default(() => randomUUID()),
    eventName: z.enum(eventNames),
    anonymousId: z.string().uuid().nullable().optional(),
    sessionId: z.string().trim().max(100).nullable().optional(),
    organizationId: z.string().uuid().nullable().optional(),
    path: z.string().trim().max(500).nullable().optional(),
    referrerOrigin: z.string().url().max(255).nullable().optional(),
    utm: z.object({
      source: z.string().trim().max(120).nullable().optional(),
      medium: z.string().trim().max(120).nullable().optional(),
      campaign: z.string().trim().max(160).nullable().optional(),
    }).optional(),
    properties: z.record(z.string().max(80), scalar).refine((value) => Object.keys(value).length <= 30).optional(),
    occurredAt: z.string().datetime(),
  }).parse(req.body)
  const organizationAllowed = input.organizationId
    ? req.authUser?.organizations.some((organization) => organization.id === input.organizationId)
    : false
  await execute(
    `INSERT IGNORE INTO analytics_events
     (event_id, event_name, anonymous_id, user_id, organization_id, session_id, path, referrer_origin,
      utm_source, utm_medium, utm_campaign, properties, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.eventId, input.eventName, input.anonymousId ?? null, req.authUser?.id ?? null,
      organizationAllowed ? input.organizationId : null, input.sessionId ?? null, input.path ?? null,
      input.referrerOrigin ? new URL(input.referrerOrigin).origin : null, input.utm?.source ?? null,
      input.utm?.medium ?? null, input.utm?.campaign ?? null, input.properties ? JSON.stringify(input.properties) : null,
      new Date(input.occurredAt)],
  )
  res.status(202).json({ accepted: true })
}))
