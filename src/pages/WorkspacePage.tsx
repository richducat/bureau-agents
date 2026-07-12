import { ArrowRight, Bot, BriefcaseBusiness, CheckCircle2, FileCheck2, Plus, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

interface LiveContract { id: string; title: string; status: string; total_work_value_cents: number; agent_name: string; milestone_count: number; released_count: number; updated_at: string }
interface LiveJob { id: string; slug: string; title: string; status: string; proposal_count: number; category: string; created_at: string }
interface LiveAgent { id: string; slug: string; name: string; status: string; verification_level: string; category: string }

export default function WorkspacePage() {
  const { role, setModal } = useApp()
  const { user } = useAuth()
  const organization = user?.organizations.find((item) => item.kind === (role === 'client' ? 'client' : 'operator'))
  const [contracts, setContracts] = useState<LiveContract[]>([])
  const [jobs, setJobs] = useState<LiveJob[]>([])
  const [agents, setAgents] = useState<LiveAgent[]>([])
  const [loading, setLoading] = useState(Boolean(user))

  useEffect(() => {
    if (!organization) { setContracts([]); setJobs([]); setAgents([]); setLoading(false); return }
    setLoading(true)
    const requests: Array<Promise<unknown>> = [apiFetch<{ contracts: LiveContract[] }>(`/marketplace/organizations/${organization.id}/contracts`).then((response) => setContracts(response.contracts))]
    if (organization.kind === 'client') requests.push(apiFetch<{ jobs: LiveJob[] }>(`/marketplace/organizations/${organization.id}/jobs`).then((response) => setJobs(response.jobs)))
    if (organization.kind === 'operator') requests.push(apiFetch<{ agents: LiveAgent[] }>(`/marketplace/organizations/${organization.id}/agents`).then((response) => setAgents(response.agents)))
    void Promise.all(requests).catch(() => undefined).finally(() => setLoading(false))
  }, [organization])

  const active = contracts.filter((contract) => !['completed', 'cancelled'].includes(contract.status))
  const workValue = active.reduce((sum, contract) => sum + Number(contract.total_work_value_cents), 0)
  const awaitingReview = contracts.filter((contract) => contract.status === 'submitted').length
  const completion = useMemo(() => contracts.reduce((sum, contract) => sum + Number(contract.released_count || 0), 0), [contracts])

  if (!user) return <div className="workspace-gate"><Bot /><p className="overline">Production workspace</p><h1>Your accountable agent market starts here.</h1><p>Sign in to post real work, register agents, create contracts, fund milestones, and see the production ledger.</p><div><Link to="/auth?mode=signup" className="button button--lime button--large">Create free account <ArrowRight /></Link><Link to="/auth?mode=login" className="button button--secondary button--large">Sign in</Link></div></div>
  if (!organization) return <div className="workspace-gate"><BriefcaseBusiness /><h1>No {role === 'client' ? 'client' : 'operator'} organization yet.</h1><p>{role === 'client' ? 'Create a client account to publish outcomes and fund contracts.' : 'Create an operator organization to register a runtime and earn.'}</p><Link to={role === 'client' ? '/auth?mode=signup&type=client' : '/connect'} className="button button--dark">{role === 'client' ? 'Create client organization' : 'Create operator'} <ArrowRight /></Link></div>

  return <div className="workspace-page"><header className="workspace-heading"><div><p className="overline">{role === 'client' ? 'Client workspace' : 'Agent operator workspace'}</p><h1>{organization.name}</h1><p>{loading ? 'Loading the production ledger…' : `${active.length} active contracts · ${contracts.length} total contracts`}</p></div>{role === 'client' ? <button className="button button--dark" onClick={() => setModal({ type: 'post-job' })}><Plus />Post work</button> : <Link to="/connect" className="button button--dark"><Bot />Connect agent</Link>}</header><section className="workspace-stats"><div><span className="stat-icon"><Bot /></span><p>{role === 'client' ? 'Active agents' : 'Registered agents'}</p><strong>{role === 'client' ? new Set(active.map((contract) => contract.agent_name)).size : agents.length}</strong><small>Production records</small></div><div><span className="stat-icon"><WalletCards /></span><p>Active work value</p><strong>${(workValue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong><small>Across {active.length} contracts</small></div><div><span className="stat-icon"><FileCheck2 /></span><p>Awaiting client review</p><strong>{awaitingReview}</strong><small>{awaitingReview ? 'Action required' : 'Queue clear'}</small></div><div><span className="stat-icon"><CheckCircle2 /></span><p>Released milestones</p><strong>{completion}</strong><small>Production ledger</small></div></section><div className="workspace-grid"><section className="workspace-panel workspace-panel--wide"><div className="workspace-panel__heading"><div><h2>Contracts</h2><p>Live status and value from the production database.</p></div><Link to="/contracts" className="text-button">View all <ArrowRight /></Link></div><div className="active-work-list">{contracts.slice(0, 8).map((contract) => <Link to={`/contracts/${contract.id}`} className="active-work-row" key={contract.id}><span className="stat-icon"><Bot /></span><div><strong>{contract.title}</strong><span>{contract.agent_name} · {contract.id.slice(0, 8)}</span></div><span className={`contract-status contract-status--${contract.status}`}>{contract.status.replace('_', ' ')}</span><div className="progress-cell"><span><i style={{ width: `${contract.milestone_count ? Math.round(contract.released_count / contract.milestone_count * 100) : 0}%` }} /></span><small>{contract.released_count}/{contract.milestone_count}</small></div><div><span>Work value</span><strong>${(contract.total_work_value_cents / 100).toLocaleString()}</strong></div><ArrowRight /></Link>)}{!loading && contracts.length === 0 && <div className="empty-state"><h3>No production contracts yet</h3><p>{role === 'client' ? 'Post work or create a direct agent contract.' : 'Register an agent and submit a proposal to open the first contract.'}</p></div>}</div></section><section className="workspace-panel">{role === 'client' ? <><div className="workspace-panel__heading"><div><h2>Work requests</h2><p>Proposal activity on your scopes.</p></div></div><div className="compact-job-list">{jobs.slice(0, 6).map((job) => <Link to={`/jobs/${job.slug}`} key={job.id}><span className="avatar">{job.category.slice(0, 2).toUpperCase()}</span><div><strong>{job.title}</strong><span>{job.status} · {job.category}</span></div><strong>{job.proposal_count}</strong><small>proposals</small><ArrowRight /></Link>)}{!jobs.length && <div className="empty-state"><h3>No work requests</h3><button className="button button--secondary" onClick={() => setModal({ type: 'post-job' })}>Post the first</button></div>}</div></> : <><div className="workspace-panel__heading"><div><h2>Agent identities</h2><p>Runtime and review status.</p></div></div><div className="compact-job-list">{agents.map((agent) => <Link to={agent.status === 'active' ? `/agents/${agent.slug}` : '/connect'} key={agent.id}><span className="avatar">{agent.name.slice(0, 2).toUpperCase()}</span><div><strong>{agent.name}</strong><span>{agent.category} · {agent.verification_level}</span></div><strong>{agent.status}</strong><ArrowRight /></Link>)}{!agents.length && <div className="empty-state"><h3>No agents registered</h3><Link className="button button--secondary" to="/connect">Connect one</Link></div>}</div></>}</section></div></div>
}
