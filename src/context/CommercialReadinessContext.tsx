import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from '../lib/api'

export interface CommercialReadiness {
  stage: 'founding_beta' | 'milestone_pilot'
  acceptingRequests: true
  acceptingNewPayments: boolean
  message: string
  paymentMode: 'live' | 'test' | 'unconfigured' | 'unknown'
  blockers: Array<{ code: string; label: string }>
  paymentProducts: {
    milestoneFunding: boolean
    subscriptions: false
    agentVerificationPurchases: false
  }
  pilotLimits: {
    currency: 'USD'
    transactionCapCents: number
    dailyChargeCapCents: number
    lifetimeChargeCapCents: number
    lifetimeExposureCapCents: number
  }
}

const safeDefault: CommercialReadiness = {
  stage: 'founding_beta',
  acceptingRequests: true,
  acceptingNewPayments: false,
  message: 'Founding beta is open for free work plans, account setup, job posts, and agent onboarding. No new payment can be created yet.',
  paymentMode: 'unconfigured',
  blockers: [{ code: 'readiness_unavailable', label: 'Live payment readiness could not be confirmed.' }],
  paymentProducts: { milestoneFunding: false, subscriptions: false, agentVerificationPurchases: false },
  pilotLimits: {
    currency: 'USD',
    transactionCapCents: 50_000,
    dailyChargeCapCents: 100_000,
    lifetimeChargeCapCents: 500_000,
    lifetimeExposureCapCents: 800_000,
  },
}

interface CommercialReadinessContextValue {
  readiness: CommercialReadiness
  loading: boolean
  refresh: () => Promise<void>
}

const CommercialReadinessContext = createContext<CommercialReadinessContextValue | null>(null)

export function CommercialReadinessProvider({ children }: { children: ReactNode }) {
  const [readiness, setReadiness] = useState<CommercialReadiness>(safeDefault)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch<{ readiness: CommercialReadiness }>('/public/readiness')
      setReadiness(response.readiness)
    } catch {
      setReadiness(safeDefault)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo(() => ({ readiness, loading, refresh }), [loading, readiness, refresh])
  return <CommercialReadinessContext.Provider value={value}>{children}</CommercialReadinessContext.Provider>
}

export function useCommercialReadiness() {
  const value = useContext(CommercialReadinessContext)
  if (!value) throw new Error('useCommercialReadiness must be used inside CommercialReadinessProvider')
  return value
}
