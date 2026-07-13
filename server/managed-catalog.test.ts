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
})
