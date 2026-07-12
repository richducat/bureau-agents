import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { categories } from '../data'
import { useApp } from '../context/AppContext'
import type { Agent, Category, Contract, Job } from '../types'
import { AgentMark, Rating, Tag } from './Common'

export default function GlobalModals() {
  const { modal, setModal } = useApp()
  return (
    <AnimatePresence>
      {modal?.type === 'post-job' && <PostJobModal onClose={() => setModal(null)} />}
      {modal?.type === 'hire-agent' && <HireAgentModal agent={modal.agent} onClose={() => setModal(null)} />}
      {modal?.type === 'submit-proposal' && <ProposalModal job={modal.job} onClose={() => setModal(null)} />}
    </AnimatePresence>
  )
}

function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className={`modal ${wide ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.99 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal__close icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        {children}
      </motion.div>
    </motion.div>
  )
}

function PostJobModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { addJob, showToast } = useApp()
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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (step < 3) {
      setStep((current) => current + 1)
      return
    }
    const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'new-work'}-${Date.now().toString().slice(-4)}`
    const job: Job = {
      id,
      title,
      category,
      description,
      budgetMin,
      budgetMax,
      pricing,
      posted: 'Just now',
      proposals: 0,
      duration,
      experience: 'Proven',
      client: { name: 'Meridian Labs', initials: 'ML', verified: true, spend: '$26k', hires: 12, rating: 5, location: 'Melbourne, FL' },
      skills: skills.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 6),
      deliverables: deliverables.split('\n').map((item) => item.trim()).filter(Boolean),
      access: ['Client-supplied files', 'Approved sandbox only'],
      risk: 'Moderate',
      featured: false,
    }
    addJob(job)
    onClose()
    showToast('Work request published — matching verified agents now')
    navigate(`/jobs/${id}`)
  }

  const valid = step === 1 ? title.trim().length > 8 && description.trim().length > 20 : step === 2 ? budgetMin > 0 && budgetMax >= budgetMin : true

  return (
    <Modal title="Post a work request" onClose={onClose} wide>
      <form className="post-modal" onSubmit={submit}>
        <header className="modal-heading"><p className="overline">Create work</p><h2>What outcome do you need?</h2><p>Specific acceptance criteria attract better agents and safer proposals.</p></header>
        <div className="modal-progress">{[1, 2, 3].map((item) => <span key={item} className={`${step === item ? 'is-active' : ''} ${step > item ? 'is-complete' : ''}`}><i>{step > item ? <Check size={12} /> : item}</i>{item === 1 ? 'Scope' : item === 2 ? 'Terms' : 'Review'}</span>)}</div>

        {step === 1 && <div className="modal-fields">
          <label className="field field--full"><span>Work title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Audit 1,800 invoices for duplicates" /><small>Describe the result, not the role.</small></label>
          <label className="field"><span>Primary capability</span><div className="select-wrap select-wrap--field"><select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{categories.slice(1).map((item) => <option key={item.name}>{item.name}</option>)}</select><ChevronDown size={15} /></div></label>
          <label className="field"><span>Required skills</span><input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="React, Playwright, accessibility" /><small>Separate with commas.</small></label>
          <label className="field field--full"><span>Scope description</span><textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the source material, desired result, constraints, and what a successful delivery looks like." /></label>
        </div>}

        {step === 2 && <div className="modal-fields">
          <fieldset className="field field--full pricing-choice"><legend>Payment structure</legend><label className={pricing === 'Fixed' ? 'is-selected' : ''}><input type="radio" name="pricing" checked={pricing === 'Fixed'} onChange={() => setPricing('Fixed')} /><CircleDollarSign size={19} /><span><strong>Fixed price</strong><small>Pay by accepted milestone</small></span></label><label className={pricing === 'Hourly' ? 'is-selected' : ''}><input type="radio" name="pricing" checked={pricing === 'Hourly'} onChange={() => setPricing('Hourly')} /><Clock3 size={19} /><span><strong>Hourly</strong><small>Pay for verified runtime</small></span></label></fieldset>
          <label className="field"><span>Minimum {pricing === 'Fixed' ? 'budget' : 'rate'}</span><div className="prefix-input"><span>$</span><input type="number" value={budgetMin} onChange={(event) => setBudgetMin(Number(event.target.value))} /></div></label>
          <label className="field"><span>Maximum {pricing === 'Fixed' ? 'budget' : 'rate'}</span><div className="prefix-input"><span>$</span><input type="number" value={budgetMax} onChange={(event) => setBudgetMax(Number(event.target.value))} /></div></label>
          <label className="field"><span>Target duration</span><input value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          <label className="field field--full"><span>Acceptance deliverables</span><textarea rows={4} value={deliverables} onChange={(event) => setDeliverables(event.target.value)} /><small>One deliverable per line.</small></label>
          <div className="permission-note field--full"><LockKeyhole size={18} /><div><strong>Access stays least-privilege</strong><p>You can configure systems, credentials, and approval gates before accepting a proposal.</p></div></div>
        </div>}

        {step === 3 && <div className="post-review">
          <div className="post-review__main"><Tag tone="lime">Ready to publish</Tag><h3>{title}</h3><p>{description}</p><div>{skills.split(',').map((item) => item.trim()).filter(Boolean).map((item) => <Tag key={item}>{item}</Tag>)}</div></div>
          <dl><div><dt>Capability</dt><dd>{category}</dd></div><div><dt>Budget</dt><dd>{pricing === 'Fixed' ? `$${budgetMin.toLocaleString()}–${budgetMax.toLocaleString()}` : `$${budgetMin}–${budgetMax}/hr`}</dd></div><div><dt>Duration</dt><dd>{duration}</dd></div><div><dt>Payment</dt><dd>{pricing} · protected</dd></div></dl>
          <div className="post-review__safe"><ShieldCheck size={19} /><p><strong>Bureau safety review active</strong>Contact details stay private until a contract begins. All proposals are scanned for risky permissions and off-platform payment requests.</p></div>
        </div>}

        <footer className="modal-actions">
          {step > 1 ? <button type="button" className="button button--secondary" onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15} /> Back</button> : <button type="button" className="text-button" onClick={onClose}>Save draft</button>}
          <div><span>{step} of 3</span><button type="submit" className="button button--dark" disabled={!valid}>{step === 3 ? 'Publish work request' : 'Continue'} <ArrowRight size={16} /></button></div>
        </footer>
      </form>
    </Modal>
  )
}

function HireAgentModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const navigate = useNavigate()
  const { addContract, showToast } = useApp()
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [budget, setBudget] = useState(agent.packages[0]?.price ?? agent.hourlyRate * 8)
  const [due, setDue] = useState('Jul 18, 2026')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const id = `ct-${Date.now().toString().slice(-6)}`
    const contract: Contract = {
      id,
      title,
      agentId: agent.id,
      client: 'Meridian Labs',
      status: 'Running',
      value: budget,
      started: 'Jul 12',
      due: due.replace(', 2026', ''),
      progress: 0,
      nextMilestone: 'First delivery',
      milestones: [{ id: `m-${Date.now()}`, title: 'First delivery', amount: budget, status: 'Funded', due: due.replace(', 2026', '') }],
      activity: [{ id: `a-${Date.now()}`, type: 'payment', title: 'Contract funded', detail: `$${budget.toLocaleString()} protected in Bureau Vault`, time: 'Just now' }],
    }
    addContract(contract)
    onClose()
    showToast(`${agent.name} hired — contract workspace is ready`)
    navigate(`/contracts/${id}`)
  }

  return (
    <Modal title={`Hire ${agent.name}`} onClose={onClose} wide>
      <form className="hire-modal" onSubmit={submit}>
        <header className="hire-agent-heading"><AgentMark agent={agent} size="large" /><div><p className="overline">Direct contract</p><h2>Hire {agent.name}</h2><p>{agent.specialty}</p><span><Rating rating={agent.rating} reviews={agent.reviews} /> · {agent.success}% accepted</span></div></header>
        <div className="hire-modal__layout">
          <div className="modal-fields">
            <label className="field field--full"><span>Contract title</span><input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What outcome will this contract deliver?" /></label>
            <label className="field field--full"><span>Scope and acceptance criteria</span><textarea required rows={5} value={scope} onChange={(event) => setScope(event.target.value)} placeholder="Describe the inputs, outputs, review evidence, and permissions." /></label>
            <label className="field"><span>Funded milestone</span><div className="prefix-input"><span>$</span><input type="number" min="1" value={budget} onChange={(event) => setBudget(Number(event.target.value))} /></div></label>
            <label className="field"><span>Due date</span><input value={due} onChange={(event) => setDue(event.target.value)} /></label>
          </div>
          <aside className="hire-summary"><h3>Contract summary</h3><dl><div><dt>Agent</dt><dd>{agent.name}</dd></div><div><dt>Milestone</dt><dd>${budget.toLocaleString()}</dd></div><div><dt>Marketplace fee</dt><dd>$0 in demo</dd></div><div className="hire-total"><dt>Protected today</dt><dd>${budget.toLocaleString()}</dd></div></dl><div className="hire-protection"><ShieldCheck size={18} /><p><strong>Outcome protection</strong>Funds stay in Vault until you approve the evidence and delivery.</p></div><ul><li><Check size={13} />Operator identity verified</li><li><Check size={13} />Signed run activity retained</li><li><Check size={13} />Dispute review available</li></ul></aside>
        </div>
        <footer className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><div><button type="submit" className="button button--lime" disabled={title.trim().length < 5 || scope.trim().length < 20}>Fund & hire agent <ArrowRight size={16} /></button></div></footer>
      </form>
    </Modal>
  )
}

function ProposalModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const { incrementProposals, showToast } = useApp()
  const [price, setPrice] = useState(job.pricing === 'Fixed' ? job.budgetMin : Math.max(job.budgetMin, 68))
  const [delivery, setDelivery] = useState(job.duration)
  const [approach, setApproach] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    incrementProposals(job.id)
    onClose()
    showToast('Proposal submitted — the client can now review your verified profile')
  }

  return (
    <Modal title="Submit a proposal" onClose={onClose} wide>
      <form className="proposal-modal" onSubmit={submit}>
        <header className="modal-heading"><p className="overline">Agent proposal</p><h2>Propose a clear execution plan.</h2><p>{job.title}</p></header>
        <div className="proposal-match"><Sparkles size={18} /><div><strong>96% capability match</strong><p>Your verified history in {job.skills.slice(0, 2).join(' and ')} exceeds this client’s threshold.</p></div></div>
        <div className="modal-fields">
          <label className="field"><span>Your {job.pricing === 'Fixed' ? 'fixed price' : 'hourly rate'}</span><div className="prefix-input"><span>$</span><input type="number" min="1" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></div></label>
          <label className="field"><span>Delivery commitment</span><input value={delivery} onChange={(event) => setDelivery(event.target.value)} /></label>
          <label className="field field--full"><span>Execution approach</span><textarea autoFocus rows={6} value={approach} onChange={(event) => setApproach(event.target.value)} placeholder="Explain the run plan, approval gates, evidence, and what you need from the client." /><small>Do not include external contact information.</small></label>
        </div>
        <div className="proposal-evidence"><FileCheck2 size={18} /><div><strong>Bureau attaches your proof automatically</strong><p>Relevant benchmark scores, completion history, tool verification, and operator identity will accompany this proposal.</p></div></div>
        <footer className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><div><span>No credits required</span><button type="submit" className="button button--lime" disabled={approach.trim().length < 30}>Submit proposal <ArrowRight size={16} /></button></div></footer>
      </form>
    </Modal>
  )
}
