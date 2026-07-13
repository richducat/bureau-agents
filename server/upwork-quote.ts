import type { ManagedServiceDefinition } from './managed.js'

export const BUREAU_FAIR_QUOTE_TERMS_VERSION = '2026-07-13-v2'

const allowedHosts = new Set(['upwork.com', 'www.upwork.com'])
const jobPaths = [
  /^\/jobs\/[A-Za-z0-9._%-]{0,400}~[A-Za-z0-9_-]{6,180}\/?$/,
  /^\/freelance-jobs\/apply\/[A-Za-z0-9._~%-]{3,400}\/?$/,
]

export function normalizeUpworkJobUrl(rawUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('Paste a complete Upwork job URL beginning with https://.')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.port
    || !allowedHosts.has(hostname)
  ) {
    throw new Error('Only HTTPS job links on upwork.com are accepted.')
  }

  const loweredPath = parsed.pathname.toLowerCase()
  if (
    loweredPath.includes('..')
    || loweredPath.includes('%2f')
    || loweredPath.includes('%5c')
    || !jobPaths.some((pattern) => pattern.test(parsed.pathname))
  ) {
    throw new Error('This does not look like a supported Upwork job-post link.')
  }

  const canonicalPath = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname
  return `https://www.upwork.com${canonicalPath}`
}

export interface BureauCatalogQuote {
  status: 'available' | 'manual_review'
  basis: 'catalog'
  scopeUnits: number
  packageCount: number
  workValueCents: number | null
  reason: string
}

export function calculateBureauCatalogQuote(service: ManagedServiceDefinition, scopeUnits: number): BureauCatalogQuote {
  const packageCount = Math.ceil(scopeUnits / service.unitCapacity)
  if (!Number.isSafeInteger(scopeUnits) || scopeUnits < 1 || scopeUnits > service.maximumAutomaticUnits) {
    return {
      status: 'manual_review',
      basis: 'catalog',
      scopeUnits,
      packageCount,
      workValueCents: null,
      reason: `Automatic pricing covers up to ${service.maximumAutomaticUnits.toLocaleString()} ${service.unitLabel}. This request needs a written scope review.`,
    }
  }
  return {
    status: 'available',
    basis: 'catalog',
    scopeUnits,
    packageCount,
    workValueCents: service.startingPriceCents * packageCount,
    reason: `${packageCount} bounded catalog ${packageCount === 1 ? 'package' : 'packages'} at the published rate.`,
  }
}

export function budgetRangeForCents(cents: number) {
  if (cents < 25_000) return 'under-250'
  if (cents < 50_000) return '250-500'
  if (cents < 100_000) return '500-1000'
  if (cents < 250_000) return '1000-2500'
  return '2500-plus'
}
