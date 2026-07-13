import { describe, expect, it } from 'vitest'
import { calculateUpworkQuote, normalizeUpworkJobUrl } from './upwork-quote.js'

const service = {
  id: 'website-fix',
  category: 'Engineering',
  startingPriceCents: 28_000,
  turnaround: '1–3 days',
  deliverables: ['Tested change'],
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

describe('Upwork beat-the-quote guarantee', () => {
  it('quotes at least ten percent below the attested reference while preserving the service floor', () => {
    expect(calculateUpworkQuote(service, 50_000)).toEqual({
      status: 'eligible',
      discountBasisPoints: 1_000,
      referenceAmountCents: 50_000,
      quoteWorkValueCents: 45_000,
      savingsCents: 5_000,
      minimumEligibleReferenceCents: 31_112,
    })
  })

  it('routes work to review when the guaranteed price would fall below the service floor', () => {
    expect(calculateUpworkQuote(service, 30_000)).toMatchObject({
      status: 'manual_review',
      quoteWorkValueCents: null,
      savingsCents: null,
      minimumEligibleReferenceCents: 31_112,
    })
  })
})
