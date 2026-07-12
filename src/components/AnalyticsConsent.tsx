import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
    <aside className="consent-banner" aria-label="Analytics choices">
      <div><strong>Your privacy, plainly.</strong><p>Bureau uses essential storage for security. Optional first-party analytics help improve conversion and are never sold.</p></div>
      <div><button className="button button--secondary" onClick={() => choose('denied')}>Essential only</button><button className="button button--lime" onClick={() => choose('granted')}>Allow analytics</button></div>
    </aside>
  )
}
