import { describe, expect, it } from 'vitest'
import { directContractUsesPublishedPrice } from './direct-contract.js'

describe('direct contract price boundary', () => {
  it('accepts only the exact published agent package price', () => {
    expect(directContractUsesPublishedPrice(28_000, 28_000)).toBe(true)
    expect(directContractUsesPublishedPrice(27_999, 28_000)).toBe(false)
    expect(directContractUsesPublishedPrice(28_001, 28_000)).toBe(false)
  })

  it('fails closed when an agent has no usable published price', () => {
    expect(directContractUsesPublishedPrice(500, null)).toBe(false)
    expect(directContractUsesPublishedPrice(500, 0)).toBe(false)
  })
})
