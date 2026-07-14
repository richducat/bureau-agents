import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { ZodError } from 'zod'
import { getConfig } from './config.js'
import { getPool } from './db.js'
import { agentApiRouter } from './routes/agent-api.js'
import { clientApiRouter } from './routes/client-api.js'
import { adminRouter } from './routes/admin.js'
import { analyticsRouter } from './routes/analytics.js'
import { authRouter } from './routes/auth.js'
import { billingRouter, stripeWebhookHandler } from './routes/billing.js'
import { marketplaceRouter, publicRouter } from './routes/marketplace.js'
import { csrfProtection, HttpError, loadSession, requireTrustedOrigin } from './security.js'
import { stripeReady } from './stripe.js'
import { emailReady } from './mailer.js'
import { commercialReadiness } from './commercial-readiness.js'

const openApiPath = fileURLToPath(new URL('./openapi.yaml', import.meta.url))

export function createApp() {
  const config = getConfig()
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.isProduction ? 1 : false)

  app.use((req, res, next) => {
    req.requestId = req.get('x-request-id')?.slice(0, 100) || randomUUID()
    res.setHeader('x-request-id', req.requestId)
    next()
  })
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  }))
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.has(origin)) return callback(null, true)
      callback(new HttpError(403, 'Request origin is not allowed.', 'origin_rejected'))
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key', 'authorization', 'x-request-id'],
    maxAge: 600,
  }))

  app.get('/health/live', (_req, res) => res.json({ status: 'ok', service: 'bureau-api' }))
  app.get('/health/ready', async (_req, res) => {
    try {
      await getPool().query('SELECT 1')
      const stripe = stripeReady()
      const email = await emailReady()
      const ready = stripe && email
      const commercial = commercialReadiness()
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', database: true, stripe, email, commercial: { stage: commercial.stage, acceptingNewPayments: commercial.acceptingNewPayments, paymentMode: commercial.paymentMode } })
    } catch {
      const commercial = commercialReadiness()
      res.status(503).json({ status: 'not_ready', database: false, stripe: stripeReady(), email: false, commercial: { stage: commercial.stage, acceptingNewPayments: commercial.acceptingNewPayments, paymentMode: commercial.paymentMode } })
    }
  })

  const serveOpenApi = (_req: express.Request, res: express.Response) => {
    res.type('application/yaml').set('cache-control', 'public, max-age=300').sendFile(openApiPath)
  }
  app.get('/openapi.yaml', serveOpenApi)
  app.get('/api/openapi.yaml', serveOpenApi)

  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '512kb' }), (req, res, next) => {
    void stripeWebhookHandler(req, res).catch(next)
  })

  app.use(express.json({ limit: '100kb', strict: true }))
  app.use(express.urlencoded({ extended: false, limit: '50kb', parameterLimit: 100 }))
  app.use(cookieParser())
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }))
  app.use(loadSession)

  // Agent-to-agent API uses scoped bearer keys, so browser CSRF controls do not apply.
  app.use('/api/v1/agent', agentApiRouter)
  app.use('/api/v1/client', clientApiRouter)

  app.use('/api', requireTrustedOrigin, csrfProtection)
  app.use('/api/auth', authRouter)
  app.use('/api/public', publicRouter)
  app.use('/api/marketplace', marketplaceRouter)
  app.use('/api/billing', billingRouter)
  app.use('/api/analytics', analyticsRouter)
  app.use('/api/admin', adminRouter)

  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found.', 'not_found')))

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    void _next
    if (res.headersSent) return
    if (error instanceof ZodError) {
      res.status(400).json({ error: { code: 'validation_failed', message: 'Some fields are invalid.', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }, requestId: req.requestId })
      return
    }
    const status = error instanceof HttpError ? error.status : 500
    const code = error instanceof HttpError ? error.code : 'internal_error'
    const message = error instanceof HttpError ? error.message : 'An unexpected error occurred.'
    if (status >= 500) console.error(`[${req.requestId}]`, error instanceof Error ? error.message : 'Unknown server error')
    res.status(status).json({ error: { code, message }, requestId: req.requestId })
  }
  app.use(errorHandler)
  return app
}
