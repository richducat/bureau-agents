import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCommercialReadiness } from '../context/CommercialReadinessContext'

export default function CommercialStatusBanner() {
  const { readiness, loading } = useCommercialReadiness()
  if (!loading && readiness.acceptingNewPayments) return null

  return <aside className="commercial-status" aria-label="Bureau launch status">
    <ShieldCheck aria-hidden="true" />
    <p><strong>Founding beta:</strong> free work plans, account setup, job posts, and agent onboarding are open. New payments are not activated.</p>
    <Link to="/start">Get a free work plan <ArrowRight aria-hidden="true" /></Link>
  </aside>
}
