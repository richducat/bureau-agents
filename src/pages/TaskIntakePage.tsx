import { ArrowRight, Check, CheckCircle2, Clock3, FileText, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MarketingFooter, MarketingHeader } from './PricingPage'
import { managedServices, serviceById } from '../services'
import { ApiError, apiFetch, jsonBody } from '../lib/api'
import { track } from '../lib/analytics'

const DRAFT_KEY = 'bureau-task-draft-v1'

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

const emptyDraft: TaskDraft = {
  contactName: '', businessName: '', email: '', serviceId: 'not-sure', title: '', details: '', budgetRange: 'not-sure', desiredTiming: 'Flexible',
}

export default function TaskIntakePage() {
  const [params] = useSearchParams()
  const requestedService = serviceById(params.get('service'))
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
  const [requestId, setRequestId] = useState('')

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])

  useEffect(() => {
    track('task_intake_started', { service: requestedService?.id ?? 'not-sure' })
  }, [requestedService?.id])

  const selectedService = useMemo(() => serviceById(draft.serviceId), [draft.serviceId])
  const update = (field: keyof TaskDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }))
  const valid = draft.contactName.trim().length >= 2 && draft.email.includes('@') && draft.title.trim().length >= 8 && draft.details.trim().length >= 80 && consent

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true); setError(''); track('task_intake_submitted', { service: draft.serviceId, budget: draft.budgetRange })
    try {
      const response = await apiFetch<{ request: { id: string; status: string } }>('/public/task-requests', {
        method: 'POST',
        body: jsonBody({ ...draft, website, consent: true, source: params.get('utm_source') ?? 'website' }),
      })
      setRequestId(response.request.id)
      window.localStorage.removeItem(DRAFT_KEY)
      track('task_request_completed', { service: draft.serviceId })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The secure intake service is temporarily unavailable. Your draft is saved in this browser; please try again shortly.')
    } finally { setSubmitting(false) }
  }

  if (requestId) return <div className="marketing-page intake-page"><MarketingHeader /><main className="intake-success"><span><CheckCircle2 /></span><p className="overline">Request received</p><h1>Your task is in the Bureau.</h1><p>We will review the request and reply with any questions, a recommended scope, timing, and final price. You will not be charged for submitting it.</p><dl><div><dt>Request reference</dt><dd>{requestId.slice(0, 8).toUpperCase()}</dd></div><div><dt>Next step</dt><dd>Scope review</dd></div><div><dt>Payment</dt><dd>Nothing due yet</dd></div></dl><div><Link className="button button--dark button--large" to="/services">See other task examples</Link><Link className="button button--secondary button--large" to="/">Return home</Link></div></main><MarketingFooter /></div>

  return <div className="marketing-page intake-page">
    <MarketingHeader />
    <main className="intake-layout">
      <section className="intake-intro">
        <p className="overline">Free task review</p>
        <h1>Tell us what needs to get done.</h1>
        <p>Use ordinary language. A rough description is enough to start; Bureau will help turn it into a safe, measurable work plan.</p>
        <div className="intake-expectations">
          <div><FileText /><span><strong>First: scope</strong><p>We confirm exactly what you receive.</p></span></div>
          <div><Clock3 /><span><strong>Then: price and timing</strong><p>You see both before agreeing to work.</p></span></div>
          <div><ShieldCheck /><span><strong>Finally: approval</strong><p>Payment release follows accepted delivery.</p></span></div>
        </div>
        <p className="intake-intro__note">Submitting a request is free and does not create a payment obligation.</p>
      </section>

      <form className="intake-form" onSubmit={submit}>
        <header><p className="overline">Your work request</p><h2>{selectedService?.title ?? 'Describe the result you need'}</h2>{selectedService && <p>Typical starting point: ${selectedService.startingPrice} · {selectedService.turnaround}</p>}</header>
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
        <button className="button button--lime button--large intake-submit" disabled={!valid || submitting}>{submitting ? 'Sending securely…' : 'Request my free work plan'} <ArrowRight /></button>
        <p className="intake-form__foot"><Check /> No charge today. No subscription required.</p>
      </form>
    </main>
    <MarketingFooter />
  </div>
}
