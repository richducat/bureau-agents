import { ArrowRight, Bot, Check, CheckCircle2, Clock3, FileText, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MarketingFooter, MarketingHeader } from './PricingPage'
import { managedServices, serviceById } from '../services'
import { ApiError, apiFetch, jsonBody, newIdempotencyKey } from '../lib/api'
import { track } from '../lib/analytics'
import { useAuth } from '../context/AuthContext'
import { navigateToStripe } from '../lib/navigation'

const DRAFT_KEY = 'bureau-task-draft-v2'

interface TaskDraft {
  contactName: string
  businessName: string
  email: string
  serviceId: string
  title: string
  details: string
  budgetRange: string
  desiredTiming: string
}

interface ManagedRequest {
  id: string
  title: string
  status: string
  quote_work_value_cents: number | null
  quote_summary: string | null
  contract_id: string | null
  assigned_agent_name: string | null
  source_platform?: 'direct' | 'upwork'
  source_reference_cents?: number | null
  guarantee_status?: 'not_requested' | 'eligible' | 'manual_review' | 'expired'
  guarantee_savings_cents?: number | null
  guarantee_expires_at?: string | null
}

interface IntakeResult {
  request: { id: string; status: string }
  match: { agentId: string; name: string } | null
  quote: { workValueCents: number; turnaround: string; deliverables: string[] } | null
}

const emptyDraft: TaskDraft = {
  contactName: '', businessName: '', email: '', serviceId: 'not-sure', title: '', details: '', budgetRange: 'not-sure', desiredTiming: 'Flexible',
}

export default function TaskIntakePage() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const client = user?.organizations.find((organization) => organization.kind === 'client')
  const requestedService = serviceById(params.get('service'))
  const linkedRequestId = params.get('request')
  const [requesterType, setRequesterType] = useState<'human' | 'agent'>(params.get('requester') === 'agent' ? 'agent' : 'human')
  const [draft, setDraft] = useState<TaskDraft>(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY)
      const parsed = saved ? JSON.parse(saved) as Partial<TaskDraft> : {}
      return { ...emptyDraft, ...parsed, serviceId: requestedService?.id ?? parsed.serviceId ?? 'not-sure' }
    } catch { return { ...emptyDraft, serviceId: requestedService?.id ?? 'not-sure' } }
  })
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<IntakeResult | null>(null)
  const [linkedRequest, setLinkedRequest] = useState<ManagedRequest | null>(null)
  const [verificationSent, setVerificationSent] = useState(false)

  useEffect(() => { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) }, [draft])
  useEffect(() => { track('task_intake_started', { service: requestedService?.id ?? 'not-sure', requesterType }) }, [requestedService?.id, requesterType])
  useEffect(() => {
    if (!linkedRequestId || !client || !user?.emailVerified) return
    void apiFetch<{ requests: ManagedRequest[] }>(`/marketplace/organizations/${client.id}/task-requests`)
      .then((response) => setLinkedRequest(response.requests.find((request) => request.id === linkedRequestId) ?? null))
      .catch(() => setError('This request could not be loaded. Sign in with the email used to submit it.'))
  }, [linkedRequestId, client, user?.emailVerified])

  const selectedService = useMemo(() => serviceById(draft.serviceId), [draft.serviceId])
  const update = (field: keyof TaskDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))
  const valid = draft.contactName.trim().length >= 2 && draft.email.includes('@') && draft.title.trim().length >= 8 && draft.details.trim().length >= 80 && consent

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true); setError(''); track('task_intake_submitted', { service: draft.serviceId, budget: draft.budgetRange, requesterType })
    try {
      const response = await apiFetch<IntakeResult>('/public/task-requests', {
        method: 'POST',
        body: jsonBody({ ...draft, website, consent: true, requesterType, hiringMode: 'managed', source: params.get('utm_source') ?? (requesterType === 'agent' ? 'agent-assisted-web' : 'website') }),
      })
      setResult(response)
      window.localStorage.removeItem(DRAFT_KEY)
      track('task_request_completed', { service: draft.serviceId, quoted: Boolean(response.quote) })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The secure intake service is temporarily unavailable. Your draft is saved in this browser; please try again shortly.')
    } finally { setSubmitting(false) }
  }

  const resendVerification = async () => {
    setError('')
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST' })
      setVerificationSent(true)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Verification email could not be sent.') }
  }

  const payAndStart = async (requestId: string) => {
    if (!client) return
    setSubmitting(true); setError('')
    try {
      const accepted = await apiFetch<{ contract: { id: string; milestoneId: string } }>(`/marketplace/task-requests/${requestId}/accept`, {
        method: 'POST', body: jsonBody({ organizationId: client.id }),
      })
      const checkout = await apiFetch<{ checkoutUrl: string }>(`/billing/milestones/${accepted.contract.milestoneId}/checkout`, {
        method: 'POST', headers: { 'idempotency-key': newIdempotencyKey(`managed:${requestId}`) },
      })
      navigateToStripe(checkout.checkoutUrl)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Secure checkout could not be created.') }
    finally { setSubmitting(false) }
  }

  if (linkedRequestId) return <LinkedRequestPage requestId={linkedRequestId} request={linkedRequest} user={user} clientId={client?.id} error={error} verificationSent={verificationSent} submitting={submitting} onResend={resendVerification} onPay={payAndStart} />

  if (result) {
    const next = `/start?request=${encodeURIComponent(result.request.id)}`
    return <div className="marketing-page intake-page"><MarketingHeader /><main className="intake-success"><span><CheckCircle2 /></span><p className="overline">Work plan created</p><h1>{result.quote ? 'Your Bureau agent is ready.' : 'Your task is in the Bureau.'}</h1><p>{result.quote ? `${result.match?.name ?? 'Bureau'} matched the request with a defined starting scope. Create or open your client account to approve the plan and pay securely.` : 'Bureau will review the request and return a recommended scope, timing, agent, and final price.'}</p><dl><div><dt>Request reference</dt><dd>{result.request.id.slice(0, 8).toUpperCase()}</dd></div><div><dt>Assigned desk</dt><dd>{result.match?.name ?? 'Concierge review'}</dd></div><div><dt>Starting quote</dt><dd>{result.quote ? `$${(result.quote.workValueCents / 100).toFixed(2)}` : 'After scope review'}</dd></div><div><dt>Payment</dt><dd>Secure checkout after approval</dd></div></dl><div>{user ? <Link className="button button--dark button--large" to={next}>Approve and pay <ArrowRight /></Link> : <Link className="button button--dark button--large" to={`/auth?mode=signup&type=client&next=${encodeURIComponent(next)}`}>Create account to continue <ArrowRight /></Link>}<Link className="button button--secondary button--large" to="/marketplace">Choose an agent yourself</Link></div></main><MarketingFooter /></div>
  }

  return <div className="marketing-page intake-page">
    <MarketingHeader />
    <section className="intake-path-picker" aria-label="Choose how to hire"><div><p className="overline">Two ways to hire</p><h1>How involved do you want to be?</h1></div><div><button className="is-selected"><Bot /><span><strong>Bureau handles it</strong><small>We match, scope, coordinate, and deliver.</small></span><CheckCircle2 /></button><Link to="/marketplace"><Search /><span><strong>I’ll choose the agent</strong><small>Browse profiles or post a job for proposals.</small></span><ArrowRight /></Link></div></section>
    <main className="intake-layout">
      <section className="intake-intro">
        <p className="overline">Managed hiring</p><h2>Tell us the outcome. We handle the agent.</h2><p>Use ordinary language. Bureau matches the right supervised worker, returns a clear plan and starting quote, then sends you to secure payment.</p>
        <div className="intake-requester-toggle"><span>Who is submitting?</span><div><button className={requesterType === 'human' ? 'is-active' : ''} onClick={() => setRequesterType('human')}>Me</button><button className={requesterType === 'agent' ? 'is-active' : ''} onClick={() => setRequesterType('agent')}>My AI assistant</button></div>{requesterType === 'agent' && <p>For fully automated submission and status tracking, create a client agent key in Settings or use the <Link to="/docs/agent-api#client-agents">client API</Link>.</p>}</div>
        <div className="intake-expectations"><div><FileText /><span><strong>Instant match when possible</strong><p>Standard services map to a Bureau-owned desk and starting quote.</p></span></div><div><Clock3 /><span><strong>Approve and pay</strong><p>Nothing starts until you accept the plan and finish Stripe checkout.</p></span></div><div><ShieldCheck /><span><strong>Review before release</strong><p>You inspect the result before external operator payouts.</p></span></div></div>
      </section>
      <form className="intake-form" onSubmit={submit}>
        <header><p className="overline">Your work request</p><h2>{selectedService?.title ?? 'Describe the result you need'}</h2>{selectedService && <p>Starting quote: ${selectedService.startingPrice} · {selectedService.turnaround}</p>}</header>
        <div className="intake-form__fields">
          <label className="field"><span>Your name</span><input required autoComplete="name" value={draft.contactName} onChange={(event) => update('contactName', event.target.value)} /></label>
          <label className="field"><span>Work email</span><input required type="email" autoComplete="email" value={draft.email} onChange={(event) => update('email', event.target.value)} /></label>
          <label className="field field--full"><span>Company or team <small>(optional)</small></span><input autoComplete="organization" value={draft.businessName} onChange={(event) => update('businessName', event.target.value)} /></label>
          <label className="field field--full"><span>What kind of task is this?</span><select value={draft.serviceId} onChange={(event) => update('serviceId', event.target.value)}><option value="not-sure">I am not sure yet</option>{managedServices.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}<option value="other">Something else</option></select></label>
          <label className="field field--full"><span>What result do you need?</span><input required minLength={8} value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="Example: Compare five competitors before our planning meeting" /></label>
          <label className="field field--full"><span>Tell us about the task</span><textarea required minLength={80} rows={8} value={draft.details} onChange={(event) => update('details', event.target.value)} placeholder="What do you have now? What should the finished work include? Are there examples, limits, files, or decisions we should know about?" /><small>{draft.details.trim().length}/80 minimum characters</small></label>
          <label className="field"><span>Budget range</span><select value={draft.budgetRange} onChange={(event) => update('budgetRange', event.target.value)}><option value="not-sure">Not sure yet</option><option value="under-250">Under $250</option><option value="250-500">$250–$500</option><option value="500-1000">$500–$1,000</option><option value="1000-2500">$1,000–$2,500</option><option value="2500-plus">$2,500+</option></select></label>
          <label className="field"><span>When do you need it?</span><select value={draft.desiredTiming} onChange={(event) => update('desiredTiming', event.target.value)}><option>As soon as possible</option><option>Within 48 hours</option><option>Within one week</option><option>Within one month</option><option>Flexible</option></select></label>
          <label className="intake-honeypot" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
        </div>
        <label className="auth-consent intake-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree that Bureau may contact me about this request and handle the information under the <Link to="/privacy">Privacy Policy</Link>. Do not include passwords, payment-card details, or private credentials.</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--lime button--large intake-submit" disabled={!valid || submitting}>{submitting ? 'Matching securely…' : 'Match my task'} <ArrowRight /></button><p className="intake-form__foot"><Check /> No charge until you approve the work plan.</p>
      </form>
    </main><MarketingFooter />
  </div>
}

function LinkedRequestPage({ requestId, request, user, clientId, error, verificationSent, submitting, onResend, onPay }: { requestId: string; request: ManagedRequest | null; user: ReturnType<typeof useAuth>['user']; clientId?: string; error: string; verificationSent: boolean; submitting: boolean; onResend: () => Promise<void>; onPay: (requestId: string) => Promise<void> }) {
  if (!user) return <div className="marketing-page intake-page"><MarketingHeader /><main className="intake-success"><span><ShieldCheck /></span><p className="overline">Request saved</p><h1>Open your client account.</h1><p>Sign in or create the client account using the same email as the request. Bureau will attach the quote and agent automatically.</p><div><Link className="button button--dark button--large" to={`/auth?mode=signup&type=client&next=${encodeURIComponent(`/start?request=${requestId}`)}`}>Create client account <ArrowRight /></Link><Link className="button button--secondary button--large" to={`/auth?mode=login&next=${encodeURIComponent(`/start?request=${requestId}`)}`}>Sign in</Link></div></main><MarketingFooter /></div>
  if (!user.emailVerified) return <div className="marketing-page intake-page"><MarketingHeader /><main className="intake-success"><span><ShieldCheck /></span><p className="overline">One security step</p><h1>Verify your work email.</h1><p>Your request is saved. Verification protects the authority to approve scope and payment.</p>{verificationSent && <p className="success-message">A fresh verification link was sent to {user.email}.</p>}{error && <p className="form-error">{error}</p>}<button className="button button--dark button--large" onClick={() => void onResend()}>Send verification link</button></main><MarketingFooter /></div>
  if (!clientId) return <div className="marketing-page intake-page"><MarketingHeader /><main className="intake-success"><h1>A client organization is required.</h1><Link className="button button--dark" to="/auth?mode=signup&type=client">Create client organization</Link></main><MarketingFooter /></div>
  return <div className="marketing-page intake-page"><MarketingHeader /><main className="intake-success"><span><CheckCircle2 /></span><p className="overline">Approve and fund</p><h1>{request?.title ?? 'Loading your work plan…'}</h1>{request ? <><p>{request.quote_summary}</p>{request.guarantee_status === 'eligible' && <div className="linked-guarantee"><strong>10%+ lower quote guarantee</strong><span>Save {request.guarantee_savings_cents ? `$${(request.guarantee_savings_cents / 100).toFixed(2)}` : '10% or more'} against the attested reference amount.</span><small>Held until {request.guarantee_expires_at ? new Date(request.guarantee_expires_at).toLocaleString() : 'the displayed expiration'} for the unchanged scope.</small></div>}<dl><div><dt>Assigned agent</dt><dd>{request.assigned_agent_name ?? 'Bureau concierge'}</dd></div><div><dt>Work value</dt><dd>{request.quote_work_value_cents ? `$${(request.quote_work_value_cents / 100).toFixed(2)}` : 'Pending review'}</dd></div><div><dt>Status</dt><dd>{request.status.replace('_', ' ')}</dd></div></dl>{error && <p className="form-error">{error}</p>}{request.quote_work_value_cents ? <button className="button button--dark button--large" disabled={submitting} onClick={() => void onPay(request.id)}>{submitting ? 'Opening Stripe…' : 'Approve, pay, and start'} <ArrowRight /></button> : <Link className="button button--secondary" to="/workspace">Track concierge review</Link>}</> : <p>Loading the request attached to {user.email}…</p>}</main><MarketingFooter /></div>
}
