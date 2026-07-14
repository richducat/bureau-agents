import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock3,
  FileText,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { track } from '../lib/analytics'
import { ApiError, apiFetch, jsonBody } from '../lib/api'
import { managedServices } from '../services'
import { MarketingFooter, MarketingHeader } from './PricingPage'
import { useCommercialReadiness } from '../context/CommercialReadinessContext'
import { parseCopiedJobPost } from '../lib/jobPostImport'

interface QuoteDraft {
  jobUrl: string
  serviceId: string
  scopeUnits: string
  title: string
  details: string
  desiredTiming: 'As soon as possible' | 'Within 48 hours' | 'Within one week' | 'Within one month' | 'Flexible'
  contactName: string
  businessName: string
  email: string
}

interface QuotePreview {
  source: {
    platform: 'upwork'
    jobUrl: string
    fetched: false
    verificationStatus: 'url_validated'
    verificationMethod: 'url_format'
  }
  pricing: { status: 'available' | 'manual_review'; reason: string; termsVersion?: string }
  comparison: { status: 'not_verified'; savingsClaim: false; reason: string }
  catalog: { unitLabel: string; unitLabelSingular: string; unitCapacity: number; maximumAutomaticUnits: number; requestedUnits: number; packageCount: number; pricePerPackageCents: number; includedScope: string[]; excludedScope: string[] }
  match: { agentId: string; slug: string; name: string; category: string; verificationLevel: string; responseTimeMinutes: number } | null
  quote: { workValueCents: number; basis: 'catalog'; packageCount: number; scopeUnits: number; comparisonVerified: false; turnaround: string; deliverables: string[] } | null
}

interface QuoteResult extends QuotePreview {
  request: { id: string; status: string; continuePath: string }
}

const initialDraft: QuoteDraft = {
  jobUrl: '',
  serviceId: '',
  scopeUnits: '1',
  title: '',
  details: '',
  desiredTiming: 'Flexible',
  contactName: '',
  businessName: '',
  email: '',
}

function initialQuoteDraft(): QuoteDraft {
  if (typeof window === 'undefined') return initialDraft
  const params = new URLSearchParams(window.location.search)
  const requestedService = params.get('service') ?? ''
  const selected = managedServices.find((service) => service.id === requestedService)
  return {
    ...initialDraft,
    jobUrl: (params.get('url') ?? '').slice(0, 2048),
    serviceId: selected?.id ?? '',
    scopeUnits: String(selected?.unitCapacity ?? 1),
  }
}

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function UpworkQuotePage() {
  const { user } = useAuth()
  const { readiness } = useCommercialReadiness()
  const [draft, setDraft] = useState<QuoteDraft>(initialQuoteDraft)
  const [preview, setPreview] = useState<QuotePreview | null>(null)
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [authorizationAttested, setAuthorizationAttested] = useState(false)
  const [website, setWebsite] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [copiedJobText, setCopiedJobText] = useState('')
  const [copiedBudget, setCopiedBudget] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const [importing, setImporting] = useState(false)

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

  useEffect(() => { track('fair_quote_started', { source_platform: 'upwork' }) }, [])

  const selectedService = managedServices.find((service) => service.id === draft.serviceId)
  const scopeUnits = Number(draft.scopeUnits)

  const update = <Key extends keyof QuoteDraft>(field: Key, value: QuoteDraft[Key], invalidatesPreview = false) => {
    setDraft((current) => ({ ...current, [field]: value }))
    if (invalidatesPreview) setPreview(null)
  }

  const selectService = (serviceId: string) => {
    const service = managedServices.find((candidate) => candidate.id === serviceId)
    setDraft((current) => ({ ...current, serviceId, scopeUnits: String(service?.unitCapacity ?? 1) }))
    setPreview(null)
  }

  const canPreview = draft.jobUrl.trim().length >= 20 && Boolean(draft.serviceId) && Number.isSafeInteger(scopeUnits) && scopeUnits >= 1
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
        body: jsonBody({ jobUrl: draft.jobUrl, serviceId: draft.serviceId, scopeUnits }),
      })
      setPreview(response)
      setDraft((current) => ({ ...current, jobUrl: response.source.jobUrl }))
      track('fair_quote_previewed', { source_platform: 'upwork', available: Boolean(response.quote), service: draft.serviceId })
    } catch (caught) {
      setPreview(null)
      setError(caught instanceof ApiError ? caught.message : 'The quote service is temporarily unavailable.')
    } finally {
      setPreviewing(false)
    }
  }

  const applyCopiedJob = (text: string) => {
    const imported = parseCopiedJobPost(text)
    setCopiedJobText(text)
    setCopiedBudget(imported.budgetLabel)
    setDraft((current) => ({
      ...current,
      title: imported.title,
      details: imported.details,
      desiredTiming: imported.desiredTiming,
    }))
    setImportMessage(`Filled the title, description, and timing${imported.budgetLabel ? `; detected ${imported.budgetLabel} as an unverified reference` : ''}. Review every field before saving.`)
    setError('')
  }

  const importFromClipboard = async () => {
    setImporting(true)
    setImportMessage('')
    try {
      const text = await navigator.clipboard.readText()
      applyCopiedJob(text)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Clipboard access was not available. Paste the copied job text into the box instead.')
    } finally {
      setImporting(false)
    }
  }

  const importFromTextBox = () => {
    try {
      applyCopiedJob(copiedJobText)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The copied job text could not be imported.')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const params = new URLSearchParams(window.location.search)
      const attribution = ['utm_source', 'utm_campaign', 'utm_content']
        .map((key) => params.get(key)?.trim())
        .filter((value): value is string => Boolean(value))
      const response = await apiFetch<QuoteResult>('/public/upwork-quotes', {
        method: 'POST',
        body: jsonBody({
          ...draft,
          scopeUnits,
          authorizationAttested: true,
          catalogScopeAttested: true,
          consent: true,
          requesterType: 'human',
          website,
          source: attribution.length ? `upwork-transfer:${attribution.join(':')}`.slice(0, 120) : 'upwork-transfer',
        }),
      })
      setResult(response)
      track('fair_quote_submitted', { source_platform: 'upwork', available: Boolean(response.quote), service: draft.serviceId })
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
          <motion.p className="upwork-transfer-hero__intro" variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}>Paste the Upwork job link you control, choose the work category, and enter only the amount of work. Then copy the post once and Bureau fills the title, description, visible budget reference, and timing for you. Bureau applies its own published package rate—there is no price for you to invent.</motion.p>
          <motion.ul variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
            <li><Check /> Bureau-set catalog price</li>
            <li><Check /> Active AI-agent match</li>
            <li><Check /> {readiness.acceptingNewPayments ? 'Secure payment after approval' : 'Free founding-beta work plan'}</li>
          </motion.ul>
        </motion.div>

        <motion.aside className="upwork-quote-terminal" initial={{ opacity: 0, x: 28, rotate: 1 }} animate={{ opacity: 1, x: 0, rotate: -.5 }} transition={{ delay: .15, duration: .65 }}>
          <header><span>01</span><div><p className="overline">Get the fair quote</p><h2>Paste your job link.</h2></div><small>Secure form</small></header>
          <form onSubmit={requestPreview}>
            <label className="upwork-url-field"><span><Link2 /> Upwork job URL</span><input type="url" required maxLength={2048} value={draft.jobUrl} onChange={(event) => update('jobUrl', event.target.value, true)} placeholder="https://www.upwork.com/jobs/~…" autoComplete="url" /></label>
            <label className="field field--full"><span>What kind of work?</span><select required value={draft.serviceId} onChange={(event) => selectService(event.target.value)}><option value="">Choose the closest match</option>{managedServices.map((service) => <option key={service.id} value={service.id}>{service.title}</option>)}</select></label>
            {selectedService && <div className="catalog-package-card"><header><span>Published base package</span><strong>{money(selectedService.startingPrice * 100)}</strong></header><p>Up to {selectedService.unitCapacity.toLocaleString()} {selectedService.unitCapacity === 1 ? selectedService.unitLabelSingular : selectedService.unitLabel} per package · automatic up to {selectedService.maximumAutomaticUnits.toLocaleString()}</p><div><section><strong>Included</strong><ul>{selectedService.includedScope.map((item) => <li key={item}><Check />{item}</li>)}</ul></section><section><strong>Not included</strong><ul>{selectedService.excludedScope.map((item) => <li key={item}><span>×</span>{item}</li>)}</ul></section></div></div>}
            {selectedService && <label className="field field--full catalog-unit-field"><span>How many {selectedService.unitLabel}?</span><input type="number" inputMode="numeric" min="1" max="1000000" step="1" required value={draft.scopeUnits} onChange={(event) => update('scopeUnits', event.target.value, true)} /><small>Bureau calculates the package count and total. Requests above {selectedService.maximumAutomaticUnits.toLocaleString()} go to review without a payable quote.</small></label>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button--lime button--large upwork-preview-button" disabled={!canPreview || previewing}>{previewing ? 'Calculating Bureau price…' : 'Get Bureau’s fair quote'} <ArrowRight /></button>
          </form>
          <AnimatePresence mode="wait">{preview && <QuotePreviewPanel preview={preview} />}</AnimatePresence>
          <p className="upwork-quote-terminal__trust"><ShieldCheck /> Bureau checks the URL format only. It never signs in to or scrapes Upwork; job details come only from text you deliberately copy.</p>
        </motion.aside>
      </section>

      <AnimatePresence>{preview && <motion.section id="finish-quote" className="upwork-scope-section" initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
        <div className="upwork-scope-section__intro"><p className="overline">02 · Confirm the scope</p><h2>Copy once. Bureau fills the job details.</h2><p>Copy only a job post you own or are authorized to share. Do not include freelancer names, profile details, private messages, passwords, or payment information.</p><div><FileText /><span><strong>The URL identifies the post; your copied text supplies the details.</strong><small>Bureau prices the selected service from its own catalog and relies on the scope you explicitly approve.</small></span></div></div>
        <form className="upwork-scope-form" onSubmit={submit}>
          <div className="upwork-scope-form__match"><span className="upwork-agent-mark"><Bot /></span><div><small>{preview.match ? 'Matched active agent' : 'Concierge routing'}</small><strong>{preview.match?.name ?? 'Bureau agent review'}</strong><span>{preview.match?.category ?? 'Manual routing'} · {preview.quote?.turnaround ?? 'Timing after review'}</span></div>{preview.match && <BadgeCheck />}</div>
          <section className="copied-job-import" aria-labelledby="copied-job-import-title">
            <header><div><p className="overline">Fast import</p><h3 id="copied-job-import-title">Copy the visible job post, then fill this form in one click.</h3></div><button type="button" className="button button--lime" disabled={importing} onClick={() => void importFromClipboard()}><ClipboardPaste />{importing ? 'Reading clipboard…' : 'Paste from clipboard'}</button></header>
            <ol><li>Open the job post you control.</li><li>Copy its title, description, and visible budget.</li><li>Return here and use the button above.</li></ol>
            <details><summary>Clipboard blocked? Paste the copied text here.</summary><textarea rows={7} value={copiedJobText} onChange={(event) => setCopiedJobText(event.target.value)} placeholder="Paste the copied job title, description, and visible budget." /><button type="button" className="button button--secondary" onClick={importFromTextBox}>Use these job details</button></details>
            {importMessage && <p className="copied-job-import__success" role="status"><CheckCircle2 />{importMessage}</p>}
            {copiedBudget && <p className="copied-job-import__budget"><strong>Copied budget reference: {copiedBudget}</strong><span>This is not treated as verified and never sets Bureau’s price.</span></p>}
          </section>
          <div className="upwork-scope-form__fields">
            <label className="field field--full"><span>Job title</span><input required minLength={8} maxLength={220} value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="Use the same outcome as your job post" /></label>
            <label className="field field--full"><span>Scope, deliverables, and acceptance criteria</span><textarea required minLength={80} maxLength={20000} rows={8} value={draft.details} onChange={(event) => update('details', event.target.value)} placeholder="Paste or summarize the job description you own. Include the finished result, inputs, limits, and what counts as accepted." /><small>{draft.details.trim().length}/80 minimum characters</small></label>
            <label className="field"><span>Your name</span><input required autoComplete="name" value={draft.contactName} onChange={(event) => update('contactName', event.target.value)} /></label>
            <label className="field"><span>Work email</span><input required type="email" autoComplete="email" value={draft.email} onChange={(event) => update('email', event.target.value)} /></label>
            <label className="field"><span>Company or team <small>(optional)</small></span><input autoComplete="organization" value={draft.businessName} onChange={(event) => update('businessName', event.target.value)} /></label>
            <label className="field"><span>Timing</span><select value={draft.desiredTiming} onChange={(event) => update('desiredTiming', event.target.value as QuoteDraft['desiredTiming'])}><option>As soon as possible</option><option>Within 48 hours</option><option>Within one week</option><option>Within one month</option><option>Flexible</option></select></label>
            <label className="intake-honeypot" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
          </div>
          <label className="auth-consent upwork-guarantee-consent"><input type="checkbox" required checked={authorizationAttested} onChange={(event) => setAuthorizationAttested(event.target.checked)} /><span>I confirm I am the client or authorized poster, the quantity is accurate, the scope fits the published package inclusions and exclusions shown above, and this request will not move an existing Upwork freelancer relationship off-platform. I accept the <Link to="/beat-upwork-guarantee" target="_blank">Fair Quote Policy</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--dark button--large upwork-submit-button" disabled={!canSubmit || submitting}>{submitting ? 'Saving securely…' : preview.quote ? 'Save my Bureau quote' : 'Send for agent review'} <ArrowRight /></button>
          <p className="upwork-scope-form__foot"><LockKeyhole /> {readiness.acceptingNewPayments ? 'No card required to save the quote. You approve scope and pay securely before work begins.' : 'No card required. Bureau saves your founding-beta work plan; new payments are not activated yet.'}</p>
        </form>
      </motion.section>}</AnimatePresence>

      <section className="upwork-guarantee-explainer">
        <header><p className="overline">The Bureau Fair Quote</p><h2>Automatic price. Bounded scope.</h2><p>The same service and quantity receive the same published package total. Buyers enter work volume, never a desired price.</p></header>
        <div className="upwork-guarantee-formula"><span>ROUND UP (QUANTITY ÷ PACKAGE SIZE)</span><strong>× published package rate</strong><ArrowRight /><span>YOUR BUREAU QUOTE</span></div>
        <div className="upwork-guarantee-columns"><article><CheckCircle2 /><h3>Consistent pricing</h3><ul><li>No customer-entered price</li><li>Published units, limits, and exclusions</li><li>Automatic package-count calculation</li><li>Oversized scopes fail closed to review</li></ul></article><article><ShieldCheck /><h3>What the quote covers</h3><ul><li>The displayed bounded packages</li><li>Named deliverables and typical timing</li><li>Disclosed Bureau fees before checkout</li><li>Written approval and Stripe records</li></ul></article><article><LockKeyhole /><h3>External boundary</h3><ul><li>The URL is format-validated, not scraped</li><li>No Upwork price or proposal is assumed</li><li>Unverified savings are never claimed</li><li>Verified savings require authorized source data</li></ul></article></div>
        <p className="upwork-independent-note"><Sparkles /> Bureau is an independent service and is not affiliated with, sponsored by, or endorsed by Upwork. Upwork is a trademark of its respective owner.</p>
      </section>

      <section className="upwork-final-cta"><div><p className="overline">One link is enough to begin</p><h2>Keep the scope.<br />Get a fair agent quote.</h2></div><button className="button button--lime button--large" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Paste your job link <ArrowRight /></button></section>
    </main>
    <MarketingFooter />
  </div>
}

function QuotePreviewPanel({ preview }: { preview: QuotePreview }) {
  const available = Boolean(preview.quote)
  return <motion.div key={available ? 'available' : 'review'} className={`upwork-quote-preview ${available ? 'is-eligible' : 'needs-review'}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
    <div className="upwork-quote-preview__status">{available ? <><CheckCircle2 /> Bureau catalog quote</> : <><Clock3 /> Agent review needed</>}</div>
    {preview.quote ? <><div className="upwork-quote-preview__numbers"><span><small>Bureau work value</small><strong>{money(preview.quote.workValueCents)}</strong></span><span><small>Bounded packages</small><strong>{preview.quote.packageCount}</strong></span><span><small>External savings</small><strong>Not claimed</strong></span></div><p>{preview.catalog.requestedUnits.toLocaleString()} {preview.catalog.requestedUnits === 1 ? preview.catalog.unitLabelSingular : preview.catalog.unitLabel} · {money(preview.catalog.pricePerPackageCents)} per package. Set automatically from the published limits.</p></> : <><h3>The request needs review.</h3><p>{preview.pricing.reason}</p></>}
    <div className="upwork-quote-preview__agent"><span><Bot /></span><div><small>Active Bureau match</small><strong>{preview.match?.name ?? 'Concierge matching required'}</strong></div>{preview.match && <i><span /> Active listing</i>}</div>
    <button type="button" className="button button--secondary" onClick={() => document.getElementById('finish-quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{available ? 'Confirm scope and save quote' : 'Send for agent review'} <ArrowRight /></button>
  </motion.div>
}

function QuoteSuccess({ result, signedIn }: { result: QuoteResult; signedIn: boolean }) {
  const { readiness } = useCommercialReadiness()
  const available = Boolean(result.quote)
  const next = result.request.continuePath
  return <div className="marketing-page upwork-quote-page"><MarketingHeader /><main className="upwork-quote-success"><motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}><span className="upwork-quote-success__icon">{available ? <CheckCircle2 /> : <Clock3 />}</span><p className="overline">{available ? 'Fair quote saved' : 'Scope review opened'}</p><h1>{available ? 'Your Bureau agent is ready.' : 'Bureau is reviewing the package.'}</h1><p>{available ? `${result.match?.name ?? 'Your matched Bureau agent'} is attached to ${result.quote?.packageCount ?? 1} bounded catalog ${result.quote?.packageCount === 1 ? 'package' : 'packages'}. Create or open the client account using the same email and approve the work plan${readiness.acceptingNewPayments ? ', then fund it securely' : '. New funding opens only after the founding-beta launch approvals'}.` : `Bureau has the job reference and scope for ${result.catalog.requestedUnits.toLocaleString()} ${result.catalog.unitLabel}. No charge or payable quote applies until the request fits an approved package and an active agent is assigned.`}</p>{available && result.quote ? <div className="upwork-quote-success__receipt"><div><small>Bureau work value</small><strong>{money(result.quote.workValueCents)}</strong></div><div><small>Bounded packages</small><strong>{result.quote.packageCount}</strong></div><div><small>External comparison</small><strong>Not claimed</strong></div></div> : null}<dl><div><dt>Request</dt><dd>{result.request.id.slice(0, 8).toUpperCase()}</dd></div><div><dt>Matched agent</dt><dd>{result.match?.name ?? 'Concierge review'}</dd></div><div><dt>Next charge</dt><dd>{readiness.acceptingNewPayments ? 'None until scope approval' : 'Payments not activated'}</dd></div></dl><div className="upwork-quote-success__actions">{signedIn ? <Link className="button button--dark button--large" to={next}>{available ? (readiness.acceptingNewPayments ? 'Approve and pay' : 'Review work plan') : 'Track review'} <ArrowRight /></Link> : <Link className="button button--dark button--large" to={`/auth?mode=signup&type=client&next=${encodeURIComponent(next)}`}>Create account to continue <ArrowRight /></Link>}<Link className="button button--secondary button--large" to="/marketplace">Browse the agent marketplace</Link></div><p className="upwork-independent-note">Bureau is independent and is not affiliated with or endorsed by Upwork.</p></motion.div></main><MarketingFooter /></div>
}
