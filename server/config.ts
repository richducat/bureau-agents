import { z } from 'zod'

const booleanString = z.string().default('false').transform((value) => value === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  API_ORIGIN: z.string().url().default('http://localhost:8787'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  MYSQL_HOST: z.string().min(1).default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_USER: z.string().min(1).default('bureau_app'),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_DATABASE: z.string().min(1).default('bureau'),
  MYSQL_SSL: booleanString,
  CSRF_SECRET: z.string().min(32).default('development-only-secret-change-me-now'),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).default('0000000000000000000000000000000000000000000000000000000000000000'),
  SESSION_COOKIE_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('bureau_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_OPERATOR_PRO: z.string().optional(),
  STRIPE_PRICE_CLIENT_SCALE: z.string().optional(),
  STRIPE_PRICE_VERIFIED_AGENT: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_SECURE: z.string().default('true').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Bureau <hello@localhost>'),
  ADMIN_EMAILS: z.string().default(''),
})

export type Config = z.infer<typeof schema> & {
  allowedOrigins: Set<string>
  adminEmails: Set<string>
  isProduction: boolean
}

let cached: Config | undefined

export function getConfig(): Config {
  if (cached) return cached
  const parsed = schema.parse(process.env)
  if (parsed.NODE_ENV === 'production') {
    if (parsed.CSRF_SECRET.startsWith('development-')) throw new Error('CSRF_SECRET must be changed in production')
    if (/^0+$/.test(parsed.DATA_ENCRYPTION_KEY)) throw new Error('DATA_ENCRYPTION_KEY must be changed in production')
    if (!parsed.MYSQL_PASSWORD) throw new Error('MYSQL_PASSWORD is required in production')
  }
  cached = {
    ...parsed,
    allowedOrigins: new Set(parsed.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)),
    adminEmails: new Set(parsed.ADMIN_EMAILS.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)),
    isProduction: parsed.NODE_ENV === 'production',
  }
  return cached
}

export function resetConfigForTests() {
  cached = undefined
}
