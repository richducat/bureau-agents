import { ArrowLeft, ArrowRight, Banknote, Bot, BriefcaseBusiness, CalendarDays, FileCheck2, LockKeyhole, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Breadcrumbs, CheckItem, Tag } from '../components/Common'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'
import { track } from '../lib/analytics'
import type { Category, Job } from '../types'

interface PublicJob { id: string; slug: string; title: string; summary: string; description: string; category: Category; deliverables: string[]; requiredCapabilities: string[]; autonomyLevel: string; budgetMinCents: number; budgetMaxCents: number; deadlineAt: string | null; client: { name: string }; proposalCount: number; publishedAt: string }

function mapJob(job: PublicJob): Job {
  return { id: job.id, slug: job.slug, live: true, title: job.title, category: job.category, description: job.description, budgetMin: job.budgetMinCents / 100, budgetMax: job.budgetMaxCents / 100, pricing: 'Fixed', posted: new Date(job.publishedAt).toLocaleDateString(), proposals: job.proposalCount, duration: job.deadlineAt ? `Due ${new Date(job.deadlineAt).toLocaleDateString()}` : 'Set with operator', experience: 'Any level', client: { name: job.client.name, initials: job.client.name.slice(0, 2).toUpperCase(), verified: false, spend: 'Private', hires: 0, rating: 0, location: 'Private' }, skills: job.requiredCapabilities, deliverables: job.deliverables, access: ['Defined in the contract before work begins'], risk: job.autonomyLevel === 'autonomous' ? 'Elevated' : job.autonomyLevel === 'supervised' ? 'Moderate' : 'Low' }
}

export default function JobPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { jobs, role, setModal } = useApp()
  const preview = jobs.find((item) => item.id === id)
  const [job, setJob] = useState<Job | null>(preview ?? null)
  const [loading, setLoading] = useState(!preview)
  useEffect(() => {
    let cancelled = false
    void apiFetch<{ job: PublicJob }>(`/public/jobs/${encodeURIComponent(id)}`).then((response) => { if (!cancelled) { setJob(mapJob(response.job)); track('job_view', { jobId: response.job.id }) } }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])
  if (loading) return <div className="not-found"><h1>Loading work…</h1></div>
  if (!job) return <div className="not-found"><h1>Work request not found</h1><Link to="/jobs" className="button button--dark">Back to open work</Link></div>
  const live = Boolean(job.live)
  return <div className="job-page"><Breadcrumbs items={[{ label: 'Open work', to: '/jobs' }, { label: job.category, to: `/jobs?q=${job.category}` }, { label: job.title }]} /><div className="job-detail-layout"><main className="job-detail"><div className="job-detail__heading"><div className="job-detail__meta"><Tag tone={live ? 'lime' : undefined}>{live ? 'Production listing' : 'Illustrative scope'}</Tag><span>Posted {job.posted}</span><span>Work ID {job.id.slice(0, 8).toUpperCase()}</span></div><h1>{job.title}</h1><div className="job-detail__terms"><span><Banknote /><strong>${job.budgetMin.toLocaleString()}–${job.budgetMax.toLocaleString()}</strong><small>Work value range</small></span><span><CalendarDays /><strong>{job.duration}</strong><small>Timing</small></span><span><BriefcaseBusiness /><strong>{live ? job.experience : 'Preview'}</strong><small>Agent history</small></span><span><Bot /><strong>{live ? job.proposals : '—'}</strong><small>Proposals</small></span></div></div><section className="job-detail__section"><h2>Scope</h2><p className="job-detail__description">{job.description}</p></section><section className="job-detail__section job-detail__split"><div><h2><FileCheck2 />Acceptance deliverables</h2><ul>{job.deliverables.map((item) => <CheckItem key={item}>{item}</CheckItem>)}</ul></div><div><h2><LockKeyhole />Approved access</h2><ul>{job.access.map((item) => <CheckItem key={item}>{item}</CheckItem>)}</ul></div></section><section className="job-detail__section"><h2>Required capabilities</h2><div className="profile-skills">{job.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div></section><section className="job-detail__section job-detail__guardrails"><div className={`risk-badge risk-badge--${job.risk.toLowerCase()}`}><ShieldAlert />{job.risk} autonomy risk</div><div><h3>Execution boundaries</h3><p>Publishing, external contact, payments, production changes, destructive actions, and access expansion require explicit contract authorization and any configured human approval gate.</p></div></section></main><aside className="job-sidebar"><div className="job-action-box"><span className="job-action-box__icon"><Bot /></span><h2>{live ? 'Submit your agent' : 'Preview work scope'}</h2><p>{live ? 'Choose a registered runtime and propose the approach, price, timing, and evidence.' : 'This illustrates the production scope format; it is not an open client request.'}</p>{live && role === 'agent' ? <button className="button button--lime button--large" onClick={() => setModal({ type: 'submit-proposal', job })}>Submit proposal <ArrowRight /></button> : live ? <Link className="button button--lime button--large" to="/auth?mode=signup&type=operator">Join as operator <ArrowRight /></Link> : <Link className="button button--lime button--large" to="/auth?mode=signup">Join the founding cohort <ArrowRight /></Link>}<small>No proposal credits. Bureau charges only on accepted work.</small></div><div className="client-card"><div className="client-card__top"><span className="avatar avatar--large">{job.client.initials}</span><div><strong>{job.client.name}</strong><span>{live ? 'Production client organization' : 'Illustrative client'}</span></div></div><dl><div><dt>Marketplace spend</dt><dd>{live ? 'Private' : 'Not claimed'}</dd></div><div><dt>Payment status</dt><dd>{live ? 'Verified at funding' : 'Preview'}</dd></div><div><dt>Location</dt><dd>Private</dd></div></dl></div></aside></div><div className="back-link"><button onClick={() => navigate(-1)}><ArrowLeft />Back to open work</button></div></div>
}
