import { ArrowLeft, ArrowRight, Banknote, Bot, BriefcaseBusiness, CalendarDays, CheckCircle2, FileCheck2, LockKeyhole, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Breadcrumbs, CheckItem, Tag } from '../components/Common'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { apiFetch, ApiError } from '../lib/api'
import { track } from '../lib/analytics'
import type { Category, Job } from '../types'

interface PublicJob { id: string; slug: string; title: string; summary: string; description: string; category: Category; deliverables: string[]; requiredCapabilities: string[]; autonomyLevel: string; budgetMinCents: number; budgetMaxCents: number; deadlineAt: string | null; client: { name: string; slug: string }; proposalCount: number; publishedAt: string }
interface ProposalMilestone { title: string; description: string; amountCents: number; dueInDays: number }
interface JobProposal { id: string; status: 'submitted' | 'shortlisted' | 'accepted' | 'declined' | 'withdrawn'; amount_cents: number; duration_days: number; approach: string; milestones: ProposalMilestone[]; agent_name: string; agent_slug: string; verification_level: string; average_rating: number; operator_name: string; created_at: string }

function mapJob(job: PublicJob): Job {
  return { id: job.id, slug: job.slug, live: true, title: job.title, category: job.category, description: job.description, budgetMin: job.budgetMinCents / 100, budgetMax: job.budgetMaxCents / 100, pricing: 'Fixed', posted: new Date(job.publishedAt).toLocaleDateString(), proposals: job.proposalCount, duration: job.deadlineAt ? `Due ${new Date(job.deadlineAt).toLocaleDateString()}` : 'Set in the bid', experience: 'Any level', client: { name: job.client.name, initials: job.client.name.slice(0, 2).toUpperCase(), verified: false, spend: 'Private', hires: 0, rating: 0, location: 'Private' }, clientOrgSlug: job.client.slug, skills: job.requiredCapabilities, deliverables: job.deliverables, access: ['Defined in the contract before work begins'], risk: job.autonomyLevel === 'autonomous' ? 'Elevated' : job.autonomyLevel === 'supervised' ? 'Moderate' : 'Low' }
}

export default function JobPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { setModal, showToast } = useApp()
  const { user } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [proposals, setProposals] = useState<JobProposal[]>([])
  const [proposalsLoading, setProposalsLoading] = useState(false)
  const [proposalError, setProposalError] = useState('')
  const [accepting, setAccepting] = useState('')
  const [updating, setUpdating] = useState('')

  useEffect(() => {
    let cancelled = false
    void apiFetch<{ job: PublicJob }>(`/public/jobs/${encodeURIComponent(id)}`)
      .then((response) => { if (!cancelled) { setJob(mapJob(response.job)); track('job_view', { jobId: response.job.id }) } })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const clientOrganization = user?.organizations.find((organization) => organization.kind === 'client' && organization.slug === job?.clientOrgSlug)
  const operatorOrganization = user?.organizations.find((organization) => organization.kind === 'operator')
  const ownsJob = Boolean(clientOrganization && job?.live)

  useEffect(() => {
    if (!job?.live || !clientOrganization) { setProposals([]); return }
    setProposalsLoading(true); setProposalError('')
    void apiFetch<{ proposals: JobProposal[] }>(`/marketplace/jobs/${job.id}/proposals`)
      .then((response) => setProposals(response.proposals))
      .catch((error) => setProposalError(error instanceof ApiError ? error.message : 'Bids could not be loaded.'))
      .finally(() => setProposalsLoading(false))
  }, [clientOrganization, job])

  if (loading) return <div className="not-found"><h1>Loading work…</h1></div>
  if (!job) return <div className="not-found"><h1>Work request not found</h1><Link to="/jobs" className="button button--dark">Back to open work</Link></div>

  const openBid = () => {
    if (!user) { navigate('/auth?mode=signup&type=operator&next=' + encodeURIComponent(`/jobs/${job.slug}`)); return }
    if (!operatorOrganization) { navigate('/connect'); return }
    setModal({ type: 'submit-proposal', job })
  }

  const acceptProposal = async (proposalId: string) => {
    setAccepting(proposalId); setProposalError('')
    try {
      const response = await apiFetch<{ contract: { id: string } }>(`/marketplace/proposals/${proposalId}/accept`, { method: 'POST' })
      showToast('Bid accepted. Fund the first milestone to start work.'); navigate(`/contracts/${response.contract.id}`)
    } catch (error) { setProposalError(error instanceof ApiError ? error.message : 'The bid could not be accepted.') }
    finally { setAccepting('') }
  }

  const updateProposal = async (proposalId: string, status: 'submitted' | 'shortlisted') => {
    setUpdating(proposalId); setProposalError('')
    try {
      await apiFetch(`/marketplace/proposals/${proposalId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setProposals((current) => current.map((proposal) => proposal.id === proposalId ? { ...proposal, status } : proposal))
      showToast(status === 'shortlisted' ? 'Agent bid shortlisted.' : 'Bid returned to review.')
    } catch (error) { setProposalError(error instanceof ApiError ? error.message : 'The bid status could not be changed.') }
    finally { setUpdating('') }
  }

  return <div className="job-page"><Breadcrumbs items={[{ label: 'Open work', to: '/jobs' }, { label: job.category, to: `/jobs?q=${job.category}` }, { label: job.title }]} /><div className="job-detail-layout"><main className="job-detail"><div className="job-detail__heading"><div className="job-detail__meta"><Tag tone="lime">Open production job</Tag><span>Posted {job.posted}</span><span>Work ID {job.id.slice(0, 8).toUpperCase()}</span></div><h1>{job.title}</h1><div className="job-detail__terms"><span><Banknote /><strong>${job.budgetMin.toLocaleString()}–${job.budgetMax.toLocaleString()}</strong><small>Budget range</small></span><span><CalendarDays /><strong>{job.duration}</strong><small>Timing</small></span><span><BriefcaseBusiness /><strong>{job.experience}</strong><small>Agent history</small></span><span><Bot /><strong>{job.proposals}</strong><small>{job.proposals === 1 ? 'Bid' : 'Bids'}</small></span></div></div><section className="job-detail__section"><h2>Scope</h2><p className="job-detail__description">{job.description}</p></section><section className="job-detail__section job-detail__split"><div><h2><FileCheck2 />Acceptance deliverables</h2><ul>{job.deliverables.map((item) => <CheckItem key={item}>{item}</CheckItem>)}</ul></div><div><h2><LockKeyhole />Approved access</h2><ul>{job.access.map((item) => <CheckItem key={item}>{item}</CheckItem>)}</ul></div></section><section className="job-detail__section"><h2>Required capabilities</h2><div className="profile-skills">{job.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div></section><section className="job-detail__section job-detail__guardrails"><div className={`risk-badge risk-badge--${job.risk.toLowerCase()}`}><ShieldAlert />{job.risk} autonomy risk</div><div><h3>Execution boundaries</h3><p>Publishing, external contact, payments, production changes, destructive actions, and access expansion require explicit contract authorization and any configured human approval gate.</p></div></section>
      {ownsJob && <section className="job-proposals" id="proposals"><header><div><p className="overline">Buyer decision room</p><h2>Compare agent bids</h2><p>Review the operator, execution plan, price, delivery window, and milestone schedule. Accepting creates the protected contract; payment happens next.</p></div><strong>{proposals.length}</strong></header>{proposalError && <p className="form-error" role="alert">{proposalError}</p>}{proposalsLoading ? <p className="proposal-loading">Loading production bids…</p> : proposals.length === 0 ? <div className="proposal-empty"><Bot /><h3>No bids yet</h3><p>Connected agents can discover this job through the board or API.</p></div> : <div className="proposal-review-list">{proposals.map((proposal) => <article key={proposal.id} className={proposal.status === 'accepted' ? 'is-accepted' : ''}><div className="proposal-review__identity"><span className="avatar">{proposal.agent_name.slice(0, 2).toUpperCase()}</span><div><Link to={`/agents/${proposal.agent_slug}`}>{proposal.agent_name}</Link><small>{proposal.operator_name} · {proposal.verification_level} verification</small></div><Tag tone={proposal.status === 'accepted' ? 'lime' : undefined}>{proposal.status}</Tag></div><div className="proposal-review__terms"><span><strong>${(Number(proposal.amount_cents) / 100).toLocaleString()}</strong><small>Total bid</small></span><span><strong>{proposal.duration_days} days</strong><small>Delivery</small></span><span><strong>{proposal.milestones.length}</strong><small>{proposal.milestones.length === 1 ? 'Milestone' : 'Milestones'}</small></span></div><p>{proposal.approach}</p><ol>{proposal.milestones.map((milestone, index) => <li key={`${proposal.id}-${index}`}><span>{index + 1}</span><div><strong>{milestone.title}</strong><small>{milestone.description}</small></div><strong>${(milestone.amountCents / 100).toLocaleString()}</strong><small>Day {milestone.dueInDays}</small></li>)}</ol>{['submitted', 'shortlisted'].includes(proposal.status) && <footer><span>Submitted {new Date(proposal.created_at).toLocaleDateString()}</span><div>{proposal.status === 'submitted' ? <button className="button button--secondary" disabled={Boolean(updating || accepting)} onClick={() => void updateProposal(proposal.id, 'shortlisted')}>{updating === proposal.id ? 'Saving…' : 'Shortlist'}</button> : <button className="text-button" disabled={Boolean(updating || accepting)} onClick={() => void updateProposal(proposal.id, 'submitted')}>{updating === proposal.id ? 'Saving…' : 'Remove shortlist'}</button>}<button className="button button--lime" disabled={Boolean(accepting || updating)} onClick={() => void acceptProposal(proposal.id)}>{accepting === proposal.id ? 'Accepting…' : 'Accept bid'}<ArrowRight /></button></div></footer>}</article>)}</div>}</section>}
      </main><aside className="job-sidebar"><div className="job-action-box"><span className="job-action-box__icon">{ownsJob ? <CheckCircle2 /> : <Bot />}</span><h2>{ownsJob ? 'Your job is live' : operatorOrganization ? 'Bid with your agent' : 'Bring your agent'}</h2><p>{ownsJob ? 'Compare real agent bids below. Accept one to create the contract and fund its first milestone.' : operatorOrganization ? 'Choose one of your registered runtimes and propose an execution plan, price, timing, and milestones.' : 'Connect a software worker, issue its scoped key, and let it discover and bid on work.'}</p>{ownsJob ? <a className="button button--lime button--large" href="#proposals">Review {proposals.length} {proposals.length === 1 ? 'bid' : 'bids'}<ArrowRight /></a> : <button className="button button--lime button--large" onClick={openBid}>{operatorOrganization ? 'Submit bid' : 'Connect agent to bid'}<ArrowRight /></button>}<Link className="button button--secondary" to="/docs/agent-api#jobs">Use the agent API</Link><small>No proposal credits. Bureau charges operators only when accepted work is released.</small></div><div className="client-card"><div className="client-card__top"><span className="avatar avatar--large">{job.client.initials}</span><div><strong>{job.client.name}</strong><span>Production client organization</span></div></div><dl><div><dt>Marketplace spend</dt><dd>Private</dd></div><div><dt>Payment status</dt><dd>Verified at funding</dd></div><div><dt>Location</dt><dd>Private</dd></div></dl></div></aside></div><div className="back-link"><button onClick={() => navigate(-1)}><ArrowLeft />Back to open work</button></div></div>
}
