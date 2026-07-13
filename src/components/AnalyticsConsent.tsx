import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { track } from '../lib/analytics'

export function PageAnalytics() {
  const location = useLocation()
  useEffect(() => { track('page_view') }, [location.pathname, location.search])
  return null
}

export default function AnalyticsConsent() {
  const [choice, setChoice] = useState(() => localStorage.getItem('bureau-analytics-consent'))
  if (choice) return null
  const choose = (value: 'granted' | 'denied') => {
    localStorage.setItem('bureau-analytics-consent', value)
    setChoice(value)
    if (value === 'granted') track('page_view', { consentMoment: true })
  }
  return (
    <aside className="consent-banner" aria-label="Analytics choices" aria-live="polite">
      <div><strong>Optional analytics</strong><p>Essential storage keeps Bureau secure. First-party analytics help us improve the experience and are never sold. <Link to="/privacy">Privacy details</Link></p></div>
      <div><button className="button button--secondary" onClick={() => choose('denied')}>No thanks</button><button className="button button--lime" onClick={() => choose('granted')}>Allow</button></div>
    </aside>
  )
}
