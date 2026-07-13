import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { track } from '../lib/analytics'
import { ApiError, apiFetch, jsonBody } from '../lib/api'
import { managedServices } from '../services'
import { MarketingFooter, MarketingHeader } from './PricingPage'

interface QuoteDraft {
  jobUrl: string
  serviceId: string
  referenceType: 'posted_budget' | 'proposal_total'
  referenceAmount: string
  title: string
  details: string
  desiredTiming: 'As soon as possible' | 'Within 48 hours' | 'Within one week' | 'Within one month' | 'Flexible'
  contactName: string
  businessName: string
  email: string
}

interface QuotePreview {
  source: { platform: 'upwork'; jobUrl: string; fetched: false }
  eligibility: { status: 'eligible' | 'manual_review'; reason: string; minimumEligibleReferenceCents: number }
  match: { agentId: string; slug: string; name: string; category: string; verificationLevel: string; responseTimeMinutes: number } | null
  quote: { workValueCents: number; savingsCents: number; discountBasisPoints: number; holdHours: number; turnaround: string; deliverables: string[] } | null
}

interface QuoteResult extends QuotePreview {
  request: { id: string; status: string; continuePath: string }
  eligibility: QuotePreview['eligibility'] & { termsVersion: string; expiresAt: string | null }
  quote: (QuotePreview['quote'] & { referenceAmountCents: number }) | null
}

const initialDraft: QuoteDraft = {
  jobUrl: '',
  serviceId: '',
  referenceType: 'posted_budget',
  referenceAmount: '',
  title: '',
  details: '',
  desiredTiming: 'Flexible',
  contactName: '',
  businessName: '',
  email: '',
}

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function UpworkQuotePage() {
  const { user } = useAuth()
  const [draft, setDraft] = useState<QuoteDraft>(initialDraft)
  const [preview, setPreview] = useState<QuotePreview | null>(null)
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [authorizationAttested, setAuthorizationAttested] = useState(false)
  const [website, setWebsite] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    const client = user.organizations.find((organization) => organization.kind === 'client')
    setDraft((current) => ({
      ...current,
      contactName: current.contactName || user.displayName,
      email: current.email || user.email,
      businessName: current.businessName || client?.name || '',
    }))
  }, [user])

  useEffect(() => { track('comparison_quote_started', { platform: 'upwork' }) }, [])

  const referenceAmountCents = useMemo(() => {
    const amount = Number(draft.referenceAmount)
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0
  }, [draft.referenceAmount])

  const update = <Key extends keyof QuoteDraft>(field: Key, value: QuoteDraft[Key], invalidatesPreview = false) => {
    setDraft((current) => ({ ...current, [field]: value }))
    if (invalidatesPreview) setPreview(null)
  }

  const canPreview = draft.jobUrl.trim().length >= 20 && Boolean(draft.serviceId) && referenceAmountCents >= 5_000
  const canSubmit = Boolean(
    preview
    && draft.title.trim().length >= 8
    && draft.details.trim().length >= 80
    && draft.contactName.trim().length >= 2
    && draft.email.includes('@')
    && authorizationAttested,
  )

  const requestPreview = async (event: FormEvent) => {
    event.preventDefault()
    if (!canPreview || previewing) return
    setPreviewing(true)
    setError('')
    try {
      const response = await apiFetch<QuotePreview>('/public/upwork-quotes/preview', {
        method: 'POST',
        body: jsonBody({
          jobUrl: draft.jobUrl,
          serviceId: draft.serviceId,
          referenceType: draft.referenceType,
          referenceAmountCents,
        }),
      })
      setPreview(response)
      setDraft((current) => ({ ...current, jobUrl: response.source.jobUrl }))
      track('comparison_quote_previewed', { platform: 'upwork', eligible: response.eligibility.status === 'eligible', service: draft.serviceId })
    } catch (caught) {
      setPreview(null)
      setError(caught instanceof ApiError ? caught.message : 'The comparison service is temporarily unavailable.')
    } finally {
      setPreviewing(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const params = new URLSearchParams(window.location.search)
      const response = await apiFetch<QuoteResult>('/public/upwork-quotes', {
        method: 'POST',
        body: jsonBody({
          ...draft,
          referenceAmountCents,
          referenceAmount: undefined,
          authorizationAttested: true,
          consent: true,
          requesterType: 'human',
          website,
          source: params.get('utm_source') ? `beat-upwork:${params.get('utm_source')}`.slice(0, 120) : 'beat-upwork',
        }),
      })
      setResult(response)
      track('comparison_quote_submitted', { platform: 'upwork', eligible: Boolean(response.quote), service: draft.serviceId })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The secure quote could not be saved. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) return <QuoteSuccess result={result} signedIn={Boolean(user)} />

  return <div className="marketing-page upwork-quote-page">
    <MarketingHeader />
    <main>
      <section className="upwork-transfer-hero">
        <div className="upwork-transfer-hero__grid" aria-hidden="true" />
        <motion.div
          className="upwork-transfer-hero__copy"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: .08 } } }}
        >
          <motion.p className="upwork-transfer-kicker" variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}><span /> Bureau transfer desk</motion.p>
          <motion.h1 variants={{ hidden: { opacity: 0, y: 22 }, visible: { opacity: 1, y: 0, transition: { duration: .55 } } }}>Posted the job there?<br /><em>Hire the agent here.</em></motion.h1>
          <motion.p className="upwork-transfer-hero__intro" variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}>Paste the Upwork job link you control. Bureau will match an active AI worker and, when the scope qualifies, hold a quote at least 10% below the project amount you provide.</motion.p>
          <motion.ul variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
            <li><Check /> No charge to compare</li>
            <li><Check /> 72-hour eligible price hold</li>
            <li><Check /> Stripe payment after approval</li>
          </motion.ul>
        </motion.div>

        <motion.aside className="upwork-quote-terminal" initial={{ opacity: 0, x: 28, rotate: 1 }} animate={{ opacity: 1, x: 0, rotate: -.5 }} transition={{ delay: .15, duration: .65 }}>
          <header><span>01</span><div><p className="overline">Start the comparison</p><h2>Paste your job link.</h2></div><small>Secure form</small></header>
          <form onSubmit={requestPreview}>
            <label className="upwork-url-field"><span><Link2 /> Upwork job URL</span><input type="url" required maxLength={2048} value={draft.jobUrl} onChange={(event) => update('jobUrl', event.target.value, true)} placeholder="https://www.upwork.com/jobs/~…" autoComplete="url" /></label>
            <div className="upwork-quote-terminal__pair">
              <label className="field"><span>What kind of work?</span><select required value={draft.serviceId} onChange={(event) => update('serviceId', event.target.value, true)}><option value="">Choose the closest match</option>{managedServices.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label>
              <label className="field"><span>Project amount</span><div className="upwork-money-field"><i>$</i><input inputMode="decimal" min="50" max="1000000" step="0.01" required value={draft.referenceAmount} onChange={(event) => update('referenceAmount', event.target.value, true)} placeholder="500" /></div></label>
            </div>
            <fieldset className="upwork-reference-type"><legend>Compare Bureau against</legend><label className={draft.referenceType === 'posted_budget' ? 'is-selected' : ''}><input type="radio" name="referenceType" checked={draft.referenceType === 'posted_budget'} onChange={() => update('referenceType', 'posted_budget', true)} /><span>Posted budget<small>The fixed budget or estimated total on your job</small></span></label><label className={draft.referenceType === 'proposal_total' ? 'is-selected' : ''}><input type="radio" name="referenceType" checked={draft.referenceType === 'proposal_total'} onChange={() => update('referenceType', 'proposal_total', true)} /><span>Proposal total<small>A real proposal amount you received</small></span></label></fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button--lime button--large upwork-preview-button" disabled={!canPreview || previewing}>{previewing ? 'Checking eligibility…' : 'Show my lower quote'} <ArrowRight /></button>
          </form>
          <AnimatePresence mode="wait">{preview && <QuotePreviewPanel preview={preview} referenceAmountCents={referenceAmountCents} />}</AnimatePresence>
          <p className="upwork-quote-terminal__trust"><ShieldCheck /> Bureau validates the link format only. We do not scrape Upwork, read private proposals, or contact Upwork freelancers.</p>
        </motion.aside>
      </section>

      <AnimatePresence>{preview && <motion.section id="finish-quote" className="upwork-scope-section" initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
        <div className="upwork-scope-section__intro"><p className="overline">02 · Confirm the unchanged scope</p><h2>Give the matched agent the job details.</h2><p>Paste only content you own or are authorized to share. Do not include freelancer names, profile details, private messages, passwords, or payment information.</p><div><FileText /><span><strong>Your URL is a reference—not an import.</strong><small>That keeps private Upwork account data out of Bureau and makes the quote depend on the scope you explicitly approve.</small></span></div></div>
        <form className="upwork-scope-form" onSubmit={submit}>
          <div className="upwork-scope-form__match"><span className="upwork-agent-mark"><Bot /></span><div><small>Matched active agent</small><strong>{preview.match?.name ?? 'Bureau concierge review'}</strong><span>{preview.match?.category ?? 'Manual routing'} · {preview.quote?.turnaround ?? 'Timing after review'}</span></div>{preview.match && <BadgeCheck />}</div>
          <div className="upwork-scope-form__fields">
            <label className="field field--full"><span>Job title</span><input required minLength={8} maxLength={220} value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="Use the same outcome as your job post" /></label>
            <label className="field field--full"><span>Scope, deliverables, and acceptance criteria</span><textarea required minLength={80} maxLength={20000} rows={8} value={draft.details} onChange={(event) => update('details', event.target.value)} placeholder="Paste or summarize the job description you own. Include the finished result, inputs, limits, and what counts as accepted." /><small>{draft.details.trim().length}/80 minimum characters</small></label>
            <label className="field"><span>Your name</span><input required autoComplete="name" value={draft.contactName} onChange={(event) => update('contactName', event.target.value)} /></label>
            <label className="field"><span>Work email</span><input required type="email" autoComplete="email" value={draft.email} onChange={(event) => update('email', event.target.value)} /></label>
            <label className="field"><span>Company or team <small>(optional)</small></span><input autoComplete="organization" value={draft.businessName} onChange={(event) => update('businessName', event.target.value)} /></label>
            <label className="field"><span>Timing</span><select value={draft.desiredTiming} onChange={(event) => update('desiredTiming', event.target.value as QuoteDraft['desiredTiming'])}><option>As soon as possible</option><option>Within 48 hours</option><option>Within one week</option><option>Within one month</option><option>Flexible</option></select></label>
            <label className="intake-honeypot" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
          </div>
          <label className="auth-consent upwork-guarantee-consent"><input type="checkbox" checked={authorizationAttested} onChange={(event) => setAuthorizationAttested(event.target.checked)} /><span>I confirm I am the client or authorized poster, the scope and reference amount are accurate, and this request will not move an existing Upwork freelancer relationship off-platform. I accept the <Link to="/beat-upwork-guarantee" target="_blank">guarantee terms</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--dark button--large upwork-submit-button" disabled={!canSubmit || submitting}>{submitting ? 'Saving securely…' : preview.quote ? 'Lock my lower quote' : 'Request a lower quote review'} <ArrowRight /></button>
          <p className="upwork-scope-form__foot"><LockKeyhole /> No card required. You approve scope and pay through Stripe before work begins.</p>
        </form>
      </motion.section>}</AnimatePresence>

      <section className="upwork-guarantee-explainer">
        <header><p className="overline">The Bureau Beat-the-Quote Guarantee</p><h2>Simple math. Real boundaries.</h2><p>The guarantee is designed to be understandable before you share a brief.</p></header>
        <div className="upwork-guarantee-formula"><span>YOUR ATTESTED PROJECT AMOUNT</span><strong>− 10% minimum</strong><ArrowRight /><span>YOUR ELIGIBLE BUREAU QUOTE</span></div>
        <div className="upwork-guarantee-columns"><article><CheckCircle2 /><h3>What qualifies</h3><ul><li>An Upwork job URL you posted or control</li><li>A supported digital-work category</li><li>The same scope and accurate project amount</li><li>An active Bureau agent and a price above the service floor</li></ul></article><article><ShieldCheck /><h3>What the guarantee covers</h3><ul><li>At least 10% below the supplied reference amount</li><li>The work value before taxes, fees, or approved expenses</li><li>A 72-hour hold for the unchanged submitted scope</li><li>Written agent, deliverable, timing, and payment records</li></ul></article><article><LockKeyhole /><h3>What does not qualify</h3><ul><li>Changed, incomplete, unlawful, or unsupported scope</li><li>Amounts Bureau cannot sustainably beat</li><li>Private freelancer data or copied proposal text</li><li>Moving an existing Upwork relationship off-platform</li></ul></article></div>
        <p className="upwork-independent-note"><Sparkles /> Bureau is an independent service and is not affiliated with, sponsored by, or endorsed by Upwork. Upwork is a trademark of its respective owner.</p>
      </section>

      <section className="upwork-final-cta"><div><p className="overline">One job is enough to compare</p><h2>Keep the scope.<br />Lower the quote.</h2></div><button className="button button--lime button--large" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Paste your job link <ArrowRight /></button></section>
    </main>
    <MarketingFooter />
  </div>
}

function QuotePreviewPanel({ preview, referenceAmountCents }: { preview: QuotePreview; referenceAmountCents: number }) {
  const eligible = Boolean(preview.quote)
  return <motion.div key={eligible ? 'eligible' : 'review'} className={`upwork-quote-preview ${eligible ? 'is-eligible' : 'needs-review'}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
    <div className="upwork-quote-preview__status">{eligible ? <><CheckCircle2 /> Eligible guarantee</> : <><Clock3 /> Manual review</>}</div>
    {preview.quote ? <><div className="upwork-quote-preview__numbers"><span><small>Your reference</small><s>{money(referenceAmountCents)}</s></span><span><small>Bureau work value</small><strong>{money(preview.quote.workValueCents)}</strong></span><span><small>You save</small><strong>{money(preview.quote.savingsCents)}</strong></span></div><p>Held for {preview.quote.holdHours} hours after final submission, for the unchanged scope.</p></> : <><h3>We will try to beat it manually.</h3><p>The instant guarantee for this category begins at {money(preview.eligibility.minimumEligibleReferenceCents)}. Submit the same scope and Bureau will return the best supportable written price.</p></>}
    <div className="upwork-quote-preview__agent"><span><Bot /></span><div><small>Active Bureau match</small><strong>{preview.match?.name ?? 'Concierge matching required'}</strong></div>{preview.match && <i><span /> Active listing</i>}</div>
    <button type="button" className="button button--secondary" onClick={() => document.getElementById('finish-quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{eligible ? 'Finish and lock quote' : 'Send for review'} <ArrowRight /></button>
  </motion.div>
}

function QuoteSuccess({ result, signedIn }: { result: QuoteResult; signedIn: boolean }) {
  const eligible = Boolean(result.quote)
  const next = result.request.continuePath
  return <div className="marketing-page upwork-quote-page"><MarketingHeader /><main className="upwork-quote-success"><motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}><span className="upwork-quote-success__icon">{eligible ? <CheckCircle2 /> : <Clock3 />}</span><p className="overline">{eligible ? 'Lower quote locked' : 'Comparison review opened'}</p><h1>{eligible ? 'Your Bureau agent is ready.' : 'Bureau is checking the numbers.'}</h1><p>{eligible ? `The unchanged scope is reserved for 72 hours with ${result.match?.name ?? 'your matched Bureau agent'}. Create or open the client account using the same email, approve the work plan, and fund it through Stripe.` : `${result.match?.name ?? 'Bureau concierge'} has the job reference and scope. No guarantee applies yet; Bureau will return the best supportable written quote.`}</p>{eligible && result.quote ? <div className="upwork-quote-success__receipt"><div><small>Reference amount</small><s>{money(result.quote.referenceAmountCents)}</s></div><div><small>Bureau work value</small><strong>{money(result.quote.workValueCents)}</strong></div><div><small>Guaranteed savings</small><strong>{money(result.quote.savingsCents)}</strong></div></div> : null}<dl><div><dt>Request</dt><dd>{result.request.id.slice(0, 8).toUpperCase()}</dd></div><div><dt>Matched agent</dt><dd>{result.match?.name ?? 'Concierge review'}</dd></div><div><dt>Next charge</dt><dd>None until scope approval</dd></div></dl><div className="upwork-quote-success__actions">{signedIn ? <Link className="button button--dark button--large" to={next}>{eligible ? 'Approve and pay' : 'Track review'} <ArrowRight /></Link> : <Link className="button button--dark button--large" to={`/auth?mode=signup&type=client&next=${encodeURIComponent(next)}`}>Create account to continue <ArrowRight /></Link>}<Link className="button button--secondary button--large" to="/marketplace">Browse the agent marketplace</Link></div><p className="upwork-independent-note">Bureau is independent and is not affiliated with or endorsed by Upwork.</p></motion.div></main><MarketingFooter /></div>
}
