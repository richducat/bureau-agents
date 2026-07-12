import { ArrowUpRight, CreditCard, Landmark, ShieldCheck } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch, jsonBody } from '../lib/api'
import { track } from '../lib/analytics'
import { navigateToStripe } from '../lib/navigation'

export default function PaymentSettingsPage() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/auth?mode=login" replace />
  const client = user.organizations.find((organization) => organization.kind === 'client')
  const operator = user.organizations.find((organization) => organization.kind === 'operator')
  const connect = async () => {
    if (!operator) return
    const result = await apiFetch<{ onboardingUrl: string }>(`/billing/connect/${operator.id}/onboard`, { method: 'POST' })
    navigateToStripe(result.onboardingUrl)
  }
  const subscribe = async (organizationId: string, plan: 'operator_pro' | 'client_scale') => {
    track('plan_selected', { plan })
    const result = await apiFetch<{ checkoutUrl: string }>('/billing/subscriptions/checkout', { method: 'POST', body: jsonBody({ organizationId, plan }) })
    navigateToStripe(result.checkoutUrl)
  }
  const portal = async (organizationId: string) => {
    const result = await apiFetch<{ portalUrl: string }>('/billing/subscriptions/portal', { method: 'POST', body: jsonBody({ organizationId }) })
    navigateToStripe(result.portalUrl)
  }
  return <div className="payment-settings"><header className="page-heading"><div><p className="overline">Money controls</p><h1>Billing & payouts</h1><p>Stripe handles payment credentials, identity verification, bank connections, invoices, and payouts.</p></div></header><section className="payment-cards">{client && <article><span><CreditCard /></span><p className="overline">Client billing</p><h2>{client.name}</h2><p>Current plan: <strong>{client.plan === 'client_scale' ? 'Scale · 3%' : 'Starter · 5%'}</strong></p><div>{client.plan === 'client_scale' ? <button className="button button--secondary" onClick={() => void portal(client.id)}>Manage subscription <ArrowUpRight /></button> : <button className="button button--dark" onClick={() => void subscribe(client.id, 'client_scale')}>Upgrade to Scale · $149/mo</button>}</div></article>}{operator && <article><span><Landmark /></span><p className="overline">Operator payouts</p><h2>{operator.name}</h2><p>Connect a verified Stripe payout account before clients fund your agent’s work.</p><div><button className="button button--dark" onClick={() => void connect()}>Verify payouts with Stripe <ArrowUpRight /></button>{operator.plan === 'operator_pro' ? <button className="button button--secondary" onClick={() => void portal(operator.id)}>Manage Pro</button> : <button className="button button--secondary" onClick={() => void subscribe(operator.id, 'operator_pro')}>Operator Pro · $49/mo</button>}</div></article>}</section><section className="payment-safety"><ShieldCheck /><div><h2>What Bureau stores</h2><p>Bureau stores Stripe object identifiers, fee calculations, payment state, and an audit ledger. Raw card and bank credentials never enter the Bureau application database.</p></div><Link to="/payment-protection">Read payment protection</Link></section></div>
}
