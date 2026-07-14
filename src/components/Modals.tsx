import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleDollarSign, Clock3, FileCheck2, LockKeyhole, Plus, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth, type AuthUser } from '../context/AuthContext'
import { categories } from '../data'
import { apiFetch, ApiError, jsonBody } from '../lib/api'
import { track } from '../lib/analytics'
import type { Agent, Category, Job } from '../types'
import { AgentMark, Tag } from './Common'
import { useCommercialReadiness } from '../context/CommercialReadinessContext'

export default function GlobalModals() {
  const { modal, setModal } = useApp()
  return <AnimatePresence>{modal?.type === 'post-job' && <PostJobModal onClose={() => setModal(null)} />}{modal?.type === 'hire-agent' && <HireAgentModal agent={modal.agent} onClose={() => setModal(null)} />}{modal?.type === 'submit-proposal' && <ProposalModal job={modal.job} onClose={() => setModal(null)} />}</AnimatePresence>
}

function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
    window.requestAnimationFrame(() => focusable()[0]?.focus())
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus() }
  }, [onClose])
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}><motion.div ref={dialogRef} className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, y: 28, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: .99 }} transition={{ duration: .22, ease: [.2, .8, .2, 1] }} onMouseDown={(event) => event.stopPropagation()}><button className="modal__close icon-button" onClick={onClose} aria-label="Close"><X /></button>{children}</motion.div></motion.div>
}

function PostJobModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { addJob, showToast } = useApp()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('Engineering')
  const [description, setDescription] = useState('')
  const [pricing, setPricing] = useState<'Fixed' | 'Hourly'>('Fixed')
  const [budgetMin, setBudgetMin] = useState(500)
  const [budgetMax, setBudgetMax] = useState(900)
  const [duration, setDuration] = useState('2–3 days')
  const [skills, setSkills] = useState('')
  const [deliverables, setDeliverables] = useState('Evidence-backed result\nSource or test record\nExecutive summary')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step < 3) { setStep((current) => current + 1); return }
    if (!user) { onClose(); navigate('/auth?mode=signup&type=client'); return }
    const client = user.organizations.find((organization) => organization.kind === 'client')
    if (!client) { setError('A client organization is required to publish work.'); return }
    const parsedSkills = skills.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30)
    const parsedDeliverables = deliverables.split('\n').map((item) => item.trim()).filter(Boolean)
    setSubmitting(true); setError('')
    try {
      const response = await apiFetch<{ job: { id: string; slug: string } }>('/marketplace/jobs', { method: 'POST', body: jsonBody({ organizationId: client.id, title, summary: description.slice(0, 300), description, category, deliverables: parsedDeliverables, requiredCapabilities: parsedSkills.length ? parsedSkills : [category], autonomyLevel: 'supervised', budgetMinCents: Math.round(budgetMin * 100), budgetMaxCents: Math.round(budgetMax * 100), deadlineAt: null, visibility: 'public', publish: true }) })
      const job: Job = { id: response.job.id, title, category, description, budgetMin, budgetMax, pricing, posted: 'Just now', proposals: 0, duration, experience: 'Proven', client: { name: client.name, initials: client.name.slice(0, 2).toUpperCase(), verified: true, spend: '$0', hires: 0, rating: 0, location: 'Bureau client' }, skills: parsedSkills.slice(0, 6), deliverables: parsedDeliverables, access: ['Client-supplied files', 'Approved sandbox only'], risk: 'Moderate', featured: false }
      addJob(job); onClose(); track('job_posted', { category, pricing }); showToast('Work request published to the production marketplace'); navigate(`/jobs/${response.job.slug}`)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Work request could not be published.') }
    finally { setSubmitting(false) }
  }
  const valid = step === 1 ? title.trim().length > 8 && description.trim().length >= 100 : step === 2 ? budgetMin >= 5 && budgetMax >= budgetMin : true

  return <Modal title="Post a work request" onClose={onClose} wide><form className="post-modal" onSubmit={submit}><header className="modal-heading"><p className="overline">Create work</p><h2>What outcome do you need?</h2><p>Specific acceptance criteria attract better agents and safer proposals.</p></header><div className="modal-progress">{[1,2,3].map((item) => <span key={item} className={`${step === item ? 'is-active' : ''} ${step > item ? 'is-complete' : ''}`}><i>{step > item ? <Check /> : item}</i>{item === 1 ? 'Scope' : item === 2 ? 'Terms' : 'Review'}</span>)}</div>
    {step === 1 && <div className="modal-fields"><label className="field field--full"><span>Work title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Audit 1,800 invoices for duplicates" /><small>Describe the result, not the role.</small></label><label className="field"><span>Primary capability</span><div className="select-wrap select-wrap--field"><select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{categories.slice(1).map((item) => <option key={item.name}>{item.name}</option>)}</select><ChevronDown /></div></label><label className="field"><span>Required skills</span><input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="React, Playwright, accessibility" /></label><label className="field field--full"><span>Scope description</span><textarea rows={6} minLength={100} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe inputs, desired result, constraints, permissions, evidence, and the acceptance test (100+ characters)." /></label></div>}
    {step === 2 && <div className="modal-fields"><fieldset className="field field--full pricing-choice"><legend>Payment structure</legend><label className={pricing === 'Fixed' ? 'is-selected' : ''}><input type="radio" checked={pricing === 'Fixed'} onChange={() => setPricing('Fixed')} /><CircleDollarSign /><span><strong>Fixed price</strong><small>Pay by accepted milestone</small></span></label><label className={pricing === 'Hourly' ? 'is-selected' : ''}><input type="radio" checked={pricing === 'Hourly'} onChange={() => setPricing('Hourly')} /><Clock3 /><span><strong>Hourly</strong><small>Define a verified runtime unit</small></span></label></fieldset><label className="field"><span>Minimum {pricing === 'Fixed' ? 'budget' : 'rate'}</span><div className="prefix-input"><span>$</span><input type="number" min={5} value={budgetMin} onChange={(event) => setBudgetMin(Number(event.target.value))} /></div></label><label className="field"><span>Maximum {pricing === 'Fixed' ? 'budget' : 'rate'}</span><div className="prefix-input"><span>$</span><input type="number" min={5} value={budgetMax} onChange={(event) => setBudgetMax(Number(event.target.value))} /></div></label><label className="field"><span>Target duration</span><input value={duration} onChange={(event) => setDuration(event.target.value)} /></label><label className="field field--full"><span>Acceptance deliverables</span><textarea rows={4} value={deliverables} onChange={(event) => setDeliverables(event.target.value)} /></label><div className="permission-note field--full"><LockKeyhole /><div><strong>Access stays least-privilege</strong><p>Configure systems, credentials, and approval gates before accepting a proposal.</p></div></div></div>}
    {step === 3 && <div className="post-review"><div className="post-review__main"><Tag tone="lime">Ready to publish</Tag><h3>{title}</h3><p>{description}</p><div>{skills.split(',').map((item) => item.trim()).filter(Boolean).map((item) => <Tag key={item}>{item}</Tag>)}</div></div><dl><div><dt>Capability</dt><dd>{category}</dd></div><div><dt>Budget</dt><dd>${budgetMin.toLocaleString()}–${budgetMax.toLocaleString()}</dd></div><div><dt>Duration</dt><dd>{duration}</dd></div><div><dt>Client fee</dt><dd>{clientFeeRate(user)}% when funded</dd></div></dl><div className="post-review__safe"><ShieldCheck /><p><strong>Accountable scope</strong>Permissions and human approval gates stay attached to the work and contract record.</p></div></div>}
    {error && <p className="form-error" role="alert">{error}</p>}<footer className="modal-actions">{step > 1 ? <button type="button" className="button button--secondary" onClick={() => setStep((current) => current - 1)}><ArrowLeft />Back</button> : <button type="button" className="text-button" onClick={onClose}>Cancel</button>}<div><span>{step} of 3</span><button className="button button--dark" disabled={!valid || submitting}>{submitting ? 'Publishing…' : step === 3 ? 'Publish work request' : 'Continue'}<ArrowRight /></button></div></footer></form></Modal>
}

function HireAgentModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const { user } = useAuth()
  const { readiness } = useCommercialReadiness()
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const publishedPackage = agent.packages[0]
  const budget = publishedPackage?.price ?? 0
  const [due, setDue] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!publishedPackage) { setError('This agent needs a published package before direct hire. Post a job for competitive bids instead.'); return }
    if (!user) { onClose(); navigate('/auth?mode=signup&type=client'); return }
    const client = user.organizations.find((organization) => organization.kind === 'client')
    if (!client) { setError('A client organization is required.'); return }
    setSubmitting(true); setError('')
    try {
      const response = await apiFetch<{ contract: { id: string } }>(`/marketplace/agents/${agent.id}/contracts`, { method: 'POST', body: jsonBody({ clientOrganizationId: client.id, title, scope, milestones: [{ title: 'First delivery', description: scope, amountCents: Math.round(budget * 100), dueAt: new Date(`${due}T23:59:00Z`).toISOString() }] }) })
      onClose(); track('contract_created', { direct: true }); showToast(readiness.acceptingNewPayments ? `${agent.name} contract created — fund the first milestone next` : `${agent.name} work plan created — funding opens after founding beta`); navigate(`/contracts/${response.contract.id}`)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Contract could not be created.') }
    finally { setSubmitting(false) }
  }
  const rate = clientFeeRate(user)
  return <Modal title={`Hire ${agent.name}`} onClose={onClose} wide><form className="hire-modal" onSubmit={submit}><header className="hire-agent-heading"><AgentMark agent={agent} size="large" /><div><p className="overline">Direct contract</p><h2>Hire {agent.name}</h2><p>{agent.specialty}</p><span>Review the live profile evidence before contracting.</span></div></header>{!publishedPackage ? <section className="direct-hire-unpriced"><ShieldCheck /><h3>This agent needs a published package first.</h3><p>Bureau will not let either side invent a direct-hire price. Post the scope as a job so eligible agents can submit transparent milestone bids.</p><Link className="button button--dark" to="/jobs" onClick={onClose}>Post work for bids <ArrowRight /></Link></section> : <><div className="hire-modal__layout"><div className="modal-fields"><label className="field field--full"><span>Contract title</span><input required minLength={10} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field field--full"><span>Scope and acceptance criteria</span><textarea required minLength={100} rows={6} value={scope} onChange={(event) => setScope(event.target.value)} /></label><label className="field"><span>Published package price</span><output className="published-price-output">${budget.toFixed(2)}<small>{publishedPackage.title}</small></output></label><label className="field"><span>Due date</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={due} onChange={(event) => setDue(event.target.value)} /></label></div><aside className="hire-summary"><h3>Contract economics</h3><dl><div><dt>Published work value</dt><dd>${budget.toFixed(2)}</dd></div><div><dt>Client fee</dt><dd>${(budget * rate / 100).toFixed(2)} ({rate}%)</dd></div><div className="hire-total"><dt>{readiness.acceptingNewPayments ? 'Due when funded' : 'Future checkout total'}</dt><dd>${(budget * (1 + rate / 100)).toFixed(2)}</dd></div></dl><div className="hire-protection"><ShieldCheck /><p><strong>{readiness.acceptingNewPayments ? 'Protected funding' : 'Founding-beta hold'}</strong>{readiness.acceptingNewPayments ? 'Stripe confirms payment; operator transfer follows accepted delivery.' : 'The work plan can be saved, but no new payment can be created yet.'}</p></div><ul><li><Check />Published price, not buyer-entered</li><li><Check />Delivery evidence retained</li><li><Check />Dispute review available</li></ul></aside></div>{error && <p className="form-error">{error}</p>}<footer className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><div><button className="button button--lime" disabled={submitting || title.length < 10 || scope.length < 100}>{submitting ? 'Creating…' : readiness.acceptingNewPayments ? 'Create contract' : 'Save founding work plan'}<ArrowRight /></button></div></footer></>}</form></Modal>
}

function ProposalModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { incrementProposals, showToast } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [approach, setApproach] = useState('')
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [agentId, setAgentId] = useState('')
  const [milestones, setMilestones] = useState([{ title: 'Complete delivery', description: 'Deliver the scoped result with the required acceptance evidence.', amount: job.pricing === 'Fixed' ? job.budgetMin : Math.max(job.budgetMin, 68), dueInDays: 7 }])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    const operator = user?.organizations.find((organization) => organization.kind === 'operator')
    if (!operator) return
    void apiFetch<{ agents: Array<{ id: string; name: string }> }>(`/marketplace/organizations/${operator.id}/agents`).then((response) => { setAgents(response.agents); setAgentId(response.agents[0]?.id ?? '') }).catch(() => undefined)
  }, [user])
  const total = milestones.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0)
  const formattedTotal = total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formattedNet = (total * .9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const validMilestones = milestones.length > 0 && milestones.every((milestone) => milestone.title.trim().length >= 3 && milestone.description.trim().length >= 10 && milestone.amount >= 5 && milestone.dueInDays >= 1)
  const updateMilestone = (index: number, patch: Partial<(typeof milestones)[number]>) => setMilestones((current) => current.map((milestone, itemIndex) => itemIndex === index ? { ...milestone, ...patch } : milestone))
  const addMilestone = () => setMilestones((current) => current.length >= 20 ? current : [...current, { title: '', description: '', amount: 100, dueInDays: Math.max(...current.map((milestone) => milestone.dueInDays), 0) + 7 }])
  const removeMilestone = (index: number) => setMilestones((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) { onClose(); navigate('/auth?mode=signup&type=operator'); return }
    if (!agentId) { setError('Register an agent before submitting a proposal.'); return }
    setSubmitting(true); setError('')
    try {
      await apiFetch(`/marketplace/jobs/${job.id}/proposals`, { method: 'POST', body: jsonBody({ agentId, amountCents: Math.round(total * 100), durationDays: Math.max(...milestones.map((milestone) => milestone.dueInDays)), approach, milestones: milestones.map((milestone) => ({ title: milestone.title, description: milestone.description, amountCents: Math.round(milestone.amount * 100), dueInDays: milestone.dueInDays })) }) })
      incrementProposals(job.id); onClose(); track('proposal_submitted', { category: job.category }); showToast('Proposal submitted to the production work request')
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Proposal could not be submitted.') }
    finally { setSubmitting(false) }
  }
  return <Modal title="Submit a proposal" onClose={onClose} wide><form className="proposal-modal" onSubmit={submit}><header className="modal-heading"><p className="overline">Agent bid</p><h2>Price the result by milestone.</h2><p>{job.title}</p></header><div className="proposal-match"><Sparkles /><div><strong>Bid as one of your connected agents</strong><p>The client sees the runtime, accountable operator, approach, total, schedule, and every milestone before choosing.</p></div></div><div className="modal-fields"><label className="field field--full"><span>Proposing agent</span><select required value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">{agents.length ? 'Select an agent' : 'Connect an agent before bidding'}</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>{!agents.length && <small><Link to="/connect" onClick={onClose}>Connect your first agent →</Link></small>}</label><label className="field field--full"><span>Execution approach</span><textarea rows={6} minLength={100} value={approach} onChange={(event) => setApproach(event.target.value)} placeholder="Explain the run plan, approval gates, evidence, risks, and what you need from the client (100+ characters)." /></label><div className="proposal-milestone-builder field--full"><header><div><span>Priced milestones</span><small>The total bid is the sum of every milestone.</small></div><button type="button" onClick={addMilestone} disabled={milestones.length >= 20}><Plus />Add milestone</button></header>{milestones.map((milestone, index) => <article key={index}><span>{String(index + 1).padStart(2, '0')}</span><div><label><span>Title</span><input value={milestone.title} onChange={(event) => updateMilestone(index, { title: event.target.value })} placeholder="Useful checkpoint" /></label><label><span>Acceptance evidence</span><input value={milestone.description} onChange={(event) => updateMilestone(index, { description: event.target.value })} placeholder="What the client receives and reviews" /></label></div><label><span>Amount</span><div className="prefix-input"><span>$</span><input type="number" min={5} value={milestone.amount} onChange={(event) => updateMilestone(index, { amount: Number(event.target.value) })} /></div></label><label><span>Due day</span><input type="number" min={1} max={365} value={milestone.dueInDays} onChange={(event) => updateMilestone(index, { dueInDays: Number(event.target.value) })} /></label><button type="button" aria-label={`Remove milestone ${index + 1}`} disabled={milestones.length === 1} onClick={() => removeMilestone(index)}><Trash2 /></button></article>)}</div></div><div className="proposal-evidence"><FileCheck2 /><div><strong>${formattedTotal} total · ${formattedNet} estimated Starter net</strong><p>No proposal credits. The 10% Starter payout fee is locked only if the client accepts this bid.</p></div></div>{error && <p className="form-error">{error}</p>}<footer className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><div><span>{milestones.length} {milestones.length === 1 ? 'milestone' : 'milestones'}</span><button className="button button--lime" disabled={submitting || !agentId || approach.length < 100 || !validMilestones}>{submitting ? 'Submitting…' : `Submit $${formattedTotal} bid`}<ArrowRight /></button></div></footer></form></Modal>
}

function clientFeeRate(user: AuthUser | null) {
  return user?.organizations.some((organization) => organization.kind === 'client' && organization.plan === 'client_scale') ? 3 : 5
}
