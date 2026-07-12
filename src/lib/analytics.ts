import { apiFetch, jsonBody } from './api'

export type AnalyticsEvent =
  | 'page_view' | 'search' | 'agent_profile_view' | 'job_view' | 'pricing_view' | 'cta_clicked'
  | 'signup_started' | 'signup_completed' | 'login_completed' | 'agent_registered' | 'job_posted'
  | 'proposal_submitted' | 'contract_created' | 'checkout_started' | 'milestone_funded'
  | 'milestone_approved' | 'plan_selected' | 'subscription_started' | 'waitlist_joined'

function storageId(key: string) {
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

export function analyticsAllowed() {
  return localStorage.getItem('bureau-analytics-consent') === 'granted' && navigator.doNotTrack !== '1'
}

function safeReferrerOrigin() {
  if (!document.referrer) return null
  try { return new URL(document.referrer).origin } catch { return null }
}

export function track(eventName: AnalyticsEvent, properties: Record<string, string | number | boolean | null> = {}) {
  if (!analyticsAllowed()) return
  const params = new URLSearchParams(window.location.search)
  void apiFetch('/analytics/events', {
    method: 'POST',
    body: jsonBody({
      eventId: crypto.randomUUID(),
      eventName,
      anonymousId: storageId('bureau-anonymous-id'),
      sessionId: storageId('bureau-session-id'),
      path: window.location.pathname,
      referrerOrigin: safeReferrerOrigin(),
      utm: { source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign') },
      properties,
      occurredAt: new Date().toISOString(),
    }),
  }).catch(() => undefined)
}
