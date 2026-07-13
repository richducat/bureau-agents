import { describe, expect, it } from 'vitest'
import { MANAGED_CATALOG } from './managed-catalog.js'
import { MANAGED_SERVICES } from './managed.js'

describe('published managed-service catalog', () => {
  it('uses one enforceable catalog with complete positive package boundaries', () => {
    expect(MANAGED_SERVICES).toBe(MANAGED_CATALOG)
    for (const service of Object.values(MANAGED_CATALOG)) {
      expect(service.startingPriceCents).toBeGreaterThanOrEqual(500)
      expect(service.unitCapacity).toBeGreaterThan(0)
      expect(service.maximumAutomaticUnits).toBeGreaterThanOrEqual(service.unitCapacity)
      expect(service.maximumAutomaticUnits % service.unitCapacity).toBe(0)
      expect(service.unitLabelSingular.length).toBeGreaterThan(0)
      expect(service.unitLabel.length).toBeGreaterThan(0)
      expect(service.includedScope.length).toBeGreaterThan(0)
      expect(service.excludedScope.length).toBeGreaterThan(0)
    }
  })

  it('keeps every published starter package between $49 and $99 with the advertised scope', () => {
    expect(MANAGED_CATALOG['spreadsheet-cleanup']).toMatchObject({ startingPriceCents: 4_900, unitCapacity: 1_000 })
    expect(MANAGED_CATALOG['content-brief']).toMatchObject({ startingPriceCents: 5_900, unitCapacity: 1 })
    expect(MANAGED_CATALOG['invoice-review']).toMatchObject({ startingPriceCents: 6_900, unitCapacity: 25 })
    expect(MANAGED_CATALOG['support-backlog']).toMatchObject({ startingPriceCents: 7_900, unitCapacity: 20 })
    expect(MANAGED_CATALOG['market-research']).toMatchObject({ startingPriceCents: 8_900, unitCapacity: 1 })
    expect(MANAGED_CATALOG['website-fix']).toMatchObject({ startingPriceCents: 9_900, unitCapacity: 1 })
    for (const service of Object.values(MANAGED_CATALOG)) {
      expect(service.startingPriceCents).toBeGreaterThanOrEqual(4_900)
      expect(service.startingPriceCents).toBeLessThanOrEqual(9_900)
    }
  })
})
