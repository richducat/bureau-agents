import { ArrowUpRight, CheckCircle2, CreditCard, Landmark, LoaderCircle, RefreshCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch, ApiError, jsonBody } from '../lib/api'
import { navigateToStripe } from '../lib/navigation'
import { useCommercialReadiness } from '../context/CommercialReadinessContext'

interface ConnectStatus {
  connected: boolean
  onboardingComplete: boolean
  payoutsEnabled: boolean
  requirements?: { currently_due?: string[]; eventually_due?: string[]; disabled_reason?: string | null }
}

export default function PaymentSettingsPage() {
  const { user } = useAuth()
  const { readiness } = useCommercialReadiness()
  const [params] = useSearchParams()
  const connectResult = params.get('connect')
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const client = user?.organizations.find((organization) => organization.kind === 'client')
  const operator = user?.organizations.find((organization) => organization.kind === 'operator')

  const refreshConnectStatus = useCallback(async () => {
    if (!operator) return
    setStatusLoading(true); setError('')
    try {
      const result = await apiFetch<ConnectStatus>(`/billing/connect/${operator.id}/status`)
      setConnectStatus(result)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Payout status could not be loaded.') }
    finally { setStatusLoading(false) }
  }, [operator])

  useEffect(() => { void refreshConnectStatus() }, [connectResult, refreshConnectStatus])

  if (!user) return <Navigate to="/auth?mode=login" replace />

  const connect = async () => {
    if (!operator) return
    setWorking(true); setError('')
    try {
      const result = await apiFetch<{ onboardingUrl: string }>(`/billing/connect/${operator.id}/onboard`, { method: 'POST' })
      navigateToStripe(result.onboardingUrl)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Stripe verification could not be opened.') }
    finally { setWorking(false) }
  }
  const portal = async (organizationId: string) => {
    setWorking(true); setError('')
    try {
      const result = await apiFetch<{ portalUrl: string }>('/billing/subscriptions/portal', { method: 'POST', body: jsonBody({ organizationId }) })
      navigateToStripe(result.portalUrl)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Billing portal could not be opened.') }
    finally { setWorking(false) }
  }

  const currentlyDue = connectStatus?.requirements?.currently_due?.length ?? 0
  const statusLabel = connectStatus?.payoutsEnabled ? 'Payouts enabled' : connectStatus?.onboardingComplete ? 'Stripe review in progress' : connectStatus?.connected ? 'Information required' : 'Not connected'

  return <div className="payment-settings"><header className="page-heading"><div><p className="overline">Money controls</p><h1>Billing & payouts</h1><p>Stripe handles payment credentials, identity verification, bank connections, invoices, and payouts.</p></div></header>{!readiness.acceptingNewPayments ? <div className="commercial-payment-callout" role="status"><ShieldCheck /><div><strong>Checkout temporarily unavailable</strong><p>Account setup and payout verification are open. No new task checkout can be created until live payment readiness is restored. Subscriptions and paid verification are not currently offered.</p></div></div> : <div className="commercial-payment-callout" role="status"><ShieldCheck /><div><strong>Pay-per-task payments are live</strong><p>Milestone checkout is open up to ${(readiness.pilotLimits.transactionCapCents / 100).toLocaleString()} per transaction and ${(readiness.pilotLimits.dailyChargeCapCents / 100).toLocaleString()} per day. New subscriptions and paid verification are not currently offered.</p></div></div>}{connectResult === 'return' && <div className="success-message" role="status">Returned from Stripe. Bureau refreshed the payout status below.</div>}{connectResult === 'refresh' && <div className="form-error" role="status">The Stripe verification link expired or needs another step. Continue verification below.</div>}{error && <p className="form-error" role="alert">{error}</p>}<section className="payment-cards">{client && <article><span><CreditCard /></span><p className="overline">Client billing</p><h2>{client.name}</h2><p>Current plan: <strong>{client.plan === 'client_scale' ? 'Scale · 3%' : 'Starter · 5%'}</strong></p><div>{client.plan === 'client_scale' ? <button className="button button--secondary" disabled={working} onClick={() => void portal(client.id)}>Manage existing subscription <ArrowUpRight /></button> : <button className="button button--dark" disabled>New subscriptions are not currently offered</button>}</div></article>}{operator && <article><span><Landmark /></span><p className="overline">Operator payouts</p><h2>{operator.name}</h2><div className={`payout-readiness ${connectStatus?.payoutsEnabled ? 'is-ready' : ''}`}>{statusLoading ? <LoaderCircle className="spin" /> : connectStatus?.payoutsEnabled ? <CheckCircle2 /> : <TriangleAlert />}<div><strong>{statusLoading ? 'Checking Stripe…' : statusLabel}</strong><small>{connectStatus?.payoutsEnabled ? 'This operator can receive released milestone funds when paid work is open.' : currentlyDue ? `${currentlyDue} Stripe ${currentlyDue === 1 ? 'requirement is' : 'requirements are'} currently due.` : 'Complete Stripe verification now so the operator is ready for paid work.'}</small></div><button className="icon-button" aria-label="Refresh payout status" disabled={statusLoading} onClick={() => void refreshConnectStatus()}><RefreshCcw /></button></div><div><button className="button button--dark" disabled={working || statusLoading} onClick={() => void connect()}>{connectStatus?.payoutsEnabled ? 'Review Stripe account' : connectStatus?.connected ? 'Continue Stripe verification' : 'Verify payouts with Stripe'} <ArrowUpRight /></button>{operator.plan === 'operator_pro' ? <button className="button button--secondary" disabled={working} onClick={() => void portal(operator.id)}>Manage existing Pro</button> : <button className="button button--secondary" disabled>New Pro subscriptions are not currently offered</button>}</div></article>}</section><section className="payment-safety"><ShieldCheck /><div><h2>What Bureau stores</h2><p>Bureau stores Stripe object identifiers, fee calculations, payment state, and an audit ledger. Raw card and bank credentials never enter the Bureau application database.</p></div><Link to="/payment-protection">Read payment protection</Link></section></div>
}
