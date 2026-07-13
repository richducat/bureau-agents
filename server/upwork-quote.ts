import type { ManagedServiceDefinition } from './managed.js'

export const UPWORK_GUARANTEE_DISCOUNT_BASIS_POINTS = 1_000
export const UPWORK_GUARANTEE_TERMS_VERSION = '2026-07-13-v1'
export const UPWORK_GUARANTEE_HOLD_HOURS = 72

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

export interface UpworkQuoteCalculation {
  status: 'eligible' | 'manual_review'
  discountBasisPoints: number
  referenceAmountCents: number
  quoteWorkValueCents: number | null
  savingsCents: number | null
  minimumEligibleReferenceCents: number
}

export function calculateUpworkQuote(
  service: ManagedServiceDefinition,
  referenceAmountCents: number,
): UpworkQuoteCalculation {
  const discountBasisPoints = UPWORK_GUARANTEE_DISCOUNT_BASIS_POINTS
  const keptBasisPoints = 10_000 - discountBasisPoints
  const maximumGuaranteedQuoteCents = Math.floor(referenceAmountCents * keptBasisPoints / 10_000)
  const minimumEligibleReferenceCents = Math.ceil(service.startingPriceCents * 10_000 / keptBasisPoints)

  if (maximumGuaranteedQuoteCents < service.startingPriceCents) {
    return {
      status: 'manual_review',
      discountBasisPoints,
      referenceAmountCents,
      quoteWorkValueCents: null,
      savingsCents: null,
      minimumEligibleReferenceCents,
    }
  }

  return {
    status: 'eligible',
    discountBasisPoints,
    referenceAmountCents,
    quoteWorkValueCents: maximumGuaranteedQuoteCents,
    savingsCents: referenceAmountCents - maximumGuaranteedQuoteCents,
    minimumEligibleReferenceCents,
  }
}

export function budgetRangeForCents(cents: number) {
  if (cents < 25_000) return 'under-250'
  if (cents < 50_000) return '250-500'
  if (cents < 100_000) return '500-1000'
  if (cents < 250_000) return '1000-2500'
  return '2500-plus'
}
