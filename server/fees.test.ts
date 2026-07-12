import { describe, expect, it } from 'vitest'
import { calculateFees } from './fees.js'

describe('calculateFees', () => {
  it('calculates starter marketplace economics without rounding ambiguity', () => {
    expect(calculateFees(100_000)).toEqual({
      workValueCents: 100_000,
      clientFeeBasisPoints: 500,
      operatorFeeBasisPoints: 1_000,
      clientFeeCents: 5_000,
      operatorFeeCents: 10_000,
      clientTotalCents: 105_000,
      operatorNetCents: 90_000,
      bureauGrossCents: 15_000,
      estimatedStripeProcessingCents: 3_075,
      estimatedConnectVariableCents: 250,
      estimatedBureauNetCents: 11_675,
    })
  })

  it('applies paid-plan discounts', () => {
    const result = calculateFees(100_000, 'client_scale', 'operator_pro')
    expect(result.clientTotalCents).toBe(103_000)
    expect(result.operatorNetCents).toBe(93_000)
    expect(result.bureauGrossCents).toBe(10_000)
  })

  it('rejects fractional and tiny work values', () => {
    expect(() => calculateFees(499)).toThrow()
    expect(() => calculateFees(1_000.5)).toThrow()
  })
})
