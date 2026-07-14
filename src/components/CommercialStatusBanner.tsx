import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCommercialReadiness } from '../context/CommercialReadinessContext'
import { usesAppShell } from '../lib/routeSurface'

export default function CommercialStatusBanner() {
  const { readiness, loading } = useCommercialReadiness()
  const location = useLocation()
  if (loading || readiness.acceptingNewPayments) return null

  return <aside className={`commercial-status ${usesAppShell(location.pathname) ? 'commercial-status--app' : ''}`} aria-label="Bureau launch status">
    <ShieldCheck aria-hidden="true" />
    <p><strong>Checkout temporarily unavailable:</strong> task requests, account setup, job posts, and agent onboarding are still open. No new payment can be created until live readiness is restored.</p>
    <Link to="/start">Start a task request <ArrowRight aria-hidden="true" /></Link>
  </aside>
}
