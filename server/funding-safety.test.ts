import { describe, expect, it } from 'vitest'
import { fundingMustFailClosed } from './funding-safety.js'

describe('funding safety gate', () => {
  it('blocks every cancelled contract', () => {
    expect(fundingMustFailClosed('cancelled', 0)).toBe(true)
  })

  it('blocks an unfunded legacy quote before migration cleanup completes', () => {
    expect(fundingMustFailClosed('pending_funding', 1)).toBe(true)
    expect(fundingMustFailClosed('pending_funding', '1')).toBe(true)
  })

  it('does not interrupt an already-active contract', () => {
    expect(fundingMustFailClosed('active', 1)).toBe(false)
    expect(fundingMustFailClosed('pending_funding', 0)).toBe(false)
  })
})
