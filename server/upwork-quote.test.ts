import { describe, expect, it } from 'vitest'
import type { ManagedServiceDefinition } from './managed.js'
import { calculateBureauCatalogQuote, normalizeUpworkJobUrl } from './upwork-quote.js'

const service: ManagedServiceDefinition = {
  id: 'website-fix',
  category: 'Engineering',
  startingPriceCents: 28_000,
  turnaround: '1–3 days',
  deliverables: ['Tested change'],
  unitLabel: 'reproducible website issues',
  unitCapacity: 1,
  maximumAutomaticUnits: 3,
  includedScope: ['One scoped fix'],
  excludedScope: ['Redesigns'],
}

describe('Upwork quote URL boundary', () => {
  it('accepts and canonicalizes recognized Upwork job links without retaining tracking data', () => {
    expect(normalizeUpworkJobUrl('https://upwork.com/jobs/~0123456789?source=feed#details'))
      .toBe('https://www.upwork.com/jobs/~0123456789')
    expect(normalizeUpworkJobUrl('https://www.upwork.com/jobs/Repair-the-checkout_~0123456789?ref=share'))
      .toBe('https://www.upwork.com/jobs/Repair-the-checkout_~0123456789')
    expect(normalizeUpworkJobUrl('https://www.upwork.com/freelance-jobs/apply/Repair-site_~01ABCDEF/'))
      .toBe('https://www.upwork.com/freelance-jobs/apply/Repair-site_~01ABCDEF')
  })

  it('rejects lookalike hosts, non-job pages, credentials, and non-HTTPS URLs', () => {
    expect(() => normalizeUpworkJobUrl('https://upwork.com.attacker.example/jobs/~0123456789')).toThrow('upwork.com')
    expect(() => normalizeUpworkJobUrl('https://www.upwork.com/nx/search/jobs/')).toThrow('job-post')
    expect(() => normalizeUpworkJobUrl('https://user:pass@www.upwork.com/jobs/~0123456789')).toThrow('Only HTTPS')
    expect(() => normalizeUpworkJobUrl('http://www.upwork.com/jobs/~0123456789')).toThrow('Only HTTPS')
  })
})

describe('Bureau fair catalog quote', () => {
  it('derives the work value only from bounded units and the published package rate', () => {
    expect(calculateBureauCatalogQuote(service, 2)).toEqual({
      status: 'available',
      basis: 'catalog',
      scopeUnits: 2,
      packageCount: 2,
      workValueCents: 56_000,
      reason: '2 bounded catalog packages at the published rate.',
    })
  })

  it('fails closed when requested volume exceeds the published package boundary', () => {
    expect(calculateBureauCatalogQuote(service, 4)).toMatchObject({
      status: 'manual_review',
      scopeUnits: 4,
      packageCount: 4,
      workValueCents: null,
    })
  })
})
