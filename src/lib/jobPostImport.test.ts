import { describe, expect, it } from 'vitest'
import { parseCopiedJobPost } from './jobPostImport'

describe('copied job post import', () => {
  it('extracts title, details, budget, and timing from user-copied text', () => {
    const parsed = parseCopiedJobPost(`
      Upwork
      Job details
      Repair our production checkout form
      Fixed-price
      $300 - $500
      We need one reproducible validation bug diagnosed and fixed. Include a tested change, regression coverage, and a short deployment note. We need this within 48 hours.
    `)
    expect(parsed.title).toBe('Repair our production checkout form')
    expect(parsed.details).toContain('regression coverage')
    expect(parsed.budgetLabel).toBe('$300 - $500')
    expect(parsed.desiredTiming).toBe('Within 48 hours')
  })

  it('fails instead of inventing details from a link or tiny fragment', () => {
    expect(() => parseCopiedJobPost('https://www.upwork.com/jobs/~0123456789')).toThrow('Copy the job title')
  })
})
