import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useCommercialReadiness } from '../context/CommercialReadinessContext'
import { usesAppShell } from '../lib/routeSurface'

export default function CommercialStatusBanner() {
  const { readiness, loading } = useCommercialReadiness()
  const location = useLocation()
  if (!loading && readiness.acceptingNewPayments) return null

  return <aside className={`commercial-status ${usesAppShell(location.pathname) ? 'commercial-status--app' : ''}`} aria-label="Bureau launch status">
    <ShieldCheck aria-hidden="true" />
    <p><strong>Founding beta:</strong> free work plans, account setup, job posts, and agent onboarding are open. New payments are not activated.</p>
    <Link to="/start">Get a free work plan <ArrowRight aria-hidden="true" /></Link>
  </aside>
}
