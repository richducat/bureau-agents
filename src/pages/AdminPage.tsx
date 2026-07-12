import { AlertTriangle, Bot, CircleDollarSign, ClipboardList, Mail, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch, jsonBody } from '../lib/api'

interface Metrics {
  financial: Record<string, number | string>
  funnel: Record<string, number | string>
  supply: Record<string, number | string>
  operations: Record<string, number | string>
  generatedAt: string
}

interface ReviewAgent { id: string; name: string; tagline: string; description: string; operator_name: string; category: string; created_at: string }
interface Dispute { id: string; contract_title: string; milestone_title: string; reason: string; statement: string; client_name: string; operator_name: string; work_value_cents: number }
interface TaskRequest { id: string; contact_name: string; business_name: string | null; email: string; service_id: string; title: string; details: string; budget_range: string; desired_timing: string; source: string | null; status: 'new' | 'reviewing' | 'quoted' | 'accepted' | 'declined' | 'completed'; admin_note: string | null; created_at: string }

const dollars = (cents: number | string | undefined) => `$${(Number(cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function AdminPage() {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [agents, setAgents] = useState<ReviewAgent[]>([])
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([])
  const [error, setError] = useState('')
  const load = async () => {
    setError('')
    try {
      const [metricData, agentData, disputeData, taskData] = await Promise.all([
        apiFetch<Metrics>('/admin/metrics'), apiFetch<{ agents: ReviewAgent[] }>('/admin/agents/review'), apiFetch<{ disputes: Dispute[] }>('/admin/disputes?status=open'), apiFetch<{ requests: TaskRequest[] }>('/admin/task-requests'),
      ])
      setMetrics(metricData); setAgents(agentData.agents); setDisputes(disputeData.disputes); setTaskRequests(taskData.requests)
    } catch { setError('Admin data is unavailable.') }
  }
  useEffect(() => { if (user?.platformRole !== 'user') void load() }, [user?.platformRole])
  if (!user || user.platformRole === 'user') return <Navigate to="/workspace" replace />
  const decide = async (agentId: string, decision: 'approve' | 'reject') => {
    await apiFetch(`/admin/agents/${agentId}/decision`, { method: 'POST', body: jsonBody({ decision, verificationLevel: decision === 'approve' ? 'identity' : 'unverified', note: decision === 'approve' ? 'Operator identity and listing review completed by Bureau admin.' : 'Listing did not meet Bureau marketplace requirements.' }) })
    await load()
  }
  const updateTask = async (requestId: string, status: TaskRequest['status']) => {
    await apiFetch(`/admin/task-requests/${requestId}`, { method: 'PATCH', body: jsonBody({ status, adminNote: '' }) })
    await load()
  }
  return <div className="admin-page"><header className="page-heading"><div><p className="overline">Platform operations</p><h1>Bureau control room</h1><p>Managed requests, money, supply, demand, trust, and disputes from the production ledger.</p></div><button className="button button--secondary" onClick={() => void load()}><RefreshCw /> Refresh</button></header>{error && <p className="form-error">{error}</p>}{metrics && <section className="admin-metrics"><article><CircleDollarSign /><span>GMV</span><strong>{dollars(metrics.financial.gmv_cents)}</strong><small>{metrics.financial.payment_count} payments</small></article><article><CircleDollarSign /><span>Bureau gross</span><strong>{dollars(metrics.financial.bureau_gross_cents)}</strong><small>before processing and Connect</small></article><article><ClipboardList /><span>Active requests</span><strong>{metrics.funnel.active_task_requests}</strong><small>new, reviewing, or quoted</small></article><article><Users /><span>Users</span><strong>{metrics.funnel.users}</strong><small>{metrics.funnel.contracts} contracts</small></article><article><Bot /><span>Live agents</span><strong>{metrics.supply.live_agents}</strong><small>{metrics.supply.online_agents} online now</small></article><article><AlertTriangle /><span>Open disputes</span><strong>{metrics.operations.open_disputes}</strong><small>{metrics.operations.failed_webhooks} failed webhooks</small></article></section>}<section className="admin-task-requests"><header><div><h2>Managed task requests</h2><p>Review new buyer briefs, prepare a scope and quote, then move each request through the concierge pipeline.</p></div><span>{taskRequests.length}</span></header>{taskRequests.length === 0 ? <p className="admin-empty">No managed task requests have arrived.</p> : <div className="admin-task-list">{taskRequests.map((request) => <article key={request.id}><div className="admin-task-list__heading"><span className={`admin-request-status admin-request-status--${request.status}`}>{request.status}</span><small>{new Date(request.created_at).toLocaleString()}</small></div><h3>{request.title}</h3><p>{request.details}</p><dl><div><dt>Contact</dt><dd>{request.contact_name}{request.business_name ? ` · ${request.business_name}` : ''}</dd></div><div><dt>Request</dt><dd>{request.service_id} · {request.budget_range} · {request.desired_timing}</dd></div></dl><footer><a className="button button--secondary" href={`mailto:${request.email}?subject=${encodeURIComponent(`Bureau request ${request.id.slice(0, 8)}: ${request.title}`)}`}><Mail /> Email client</a><select aria-label={`Update status for ${request.title}`} value={request.status} onChange={(event) => void updateTask(request.id, event.target.value as TaskRequest['status'])}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="quoted">Quoted</option><option value="accepted">Accepted</option><option value="completed">Completed</option><option value="declined">Declined</option></select></footer></article>)}</div>}</section><div className="admin-columns"><section><header><h2>Agent review queue</h2><span>{agents.length}</span></header>{agents.length === 0 ? <p className="admin-empty">No agent listings await review.</p> : agents.map((agent) => <article className="admin-review" key={agent.id}><div><Bot /><span><strong>{agent.name}</strong><small>{agent.operator_name} · {agent.category}</small></span></div><h3>{agent.tagline}</h3><p>{agent.description}</p><footer><button className="button button--secondary" onClick={() => void decide(agent.id, 'reject')}>Reject</button><button className="button button--dark" onClick={() => void decide(agent.id, 'approve')}><ShieldCheck /> Approve identity</button></footer></article>)}</section><section><header><h2>Open disputes</h2><span>{disputes.length}</span></header>{disputes.length === 0 ? <p className="admin-empty">No contracts are currently disputed.</p> : disputes.map((dispute) => <article className="admin-dispute" key={dispute.id}><p className="overline">{dispute.reason}</p><h3>{dispute.contract_title}</h3><p>{dispute.statement}</p><dl><div><dt>Client</dt><dd>{dispute.client_name}</dd></div><div><dt>Operator</dt><dd>{dispute.operator_name}</dd></div><div><dt>Work value</dt><dd>{dollars(dispute.work_value_cents)}</dd></div></dl><button className="button button--dark">Open resolution workspace</button></article>)}</section></div></div>
}
