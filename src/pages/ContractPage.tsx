import { ArrowLeft, ArrowRight, Check, FileText, LockKeyhole, MessageSquare, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Breadcrumbs } from '../components/Common'
import { useAuth } from '../context/AuthContext'
import { apiFetch, ApiError, jsonBody, newIdempotencyKey } from '../lib/api'
import { track } from '../lib/analytics'
import { navigateToStripe, safeHttpsUrl } from '../lib/navigation'
import { useCommercialReadiness } from '../context/CommercialReadinessContext'

interface ContractRecord { id: string; title: string; scope: string; status: string; total_work_value_cents: number; client_fee_basis_points: number; operator_fee_basis_points: number; client_org_id: string; operator_org_id: string; agent_id: string; agent_name: string; agent_slug: string; client_name: string; operator_name: string; created_at: string; started_at: string | null }
interface MilestoneRecord { id: string; sequence_number: number; title: string; description: string; work_value_cents: number; status: string; due_at: string | null; funded_at: string | null; submitted_at: string | null; released_at: string | null }
interface MessageRecord { id: string; body: string; sender_user_id: string | null; sender_agent_id: string | null; sender_user_name: string | null; sender_agent_name: string | null; created_at: string }
interface DeliverableRecord { id: string; milestone_id: string; title: string; description: string; artifact_url: string | null; artifact_sha256: string | null; created_at: string }
interface ContractResponse { contract: ContractRecord; milestones: MilestoneRecord[]; messages: MessageRecord[]; deliverables: DeliverableRecord[] }

export default function ContractPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { readiness } = useCommercialReadiness()
  const [data, setData] = useState<ContractResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [deliveryMilestone, setDeliveryMilestone] = useState<string | null>(null)
  const [deliveryTitle, setDeliveryTitle] = useState('')
  const [deliveryDescription, setDeliveryDescription] = useState('')
  const [artifactUrl, setArtifactUrl] = useState('')
  const [disputeMilestone, setDisputeMilestone] = useState<string | null>(null)
  const [disputeStatement, setDisputeStatement] = useState('')
  const load = useCallback(async () => {
    try { setData(await apiFetch<ContractResponse>(`/marketplace/contracts/${id}`)); setError('') }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Contract could not be loaded.') }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { if (user) void load() }, [user, load])
  const clientSide = Boolean(data && data.contract.status !== 'cancelled' && user?.organizations.some((organization) => organization.id === data.contract.client_org_id))
  const operatorSide = Boolean(data && user?.organizations.some((organization) => organization.id === data.contract.operator_org_id))
  const progress = useMemo(() => data?.milestones.length ? Math.round(data.milestones.filter((milestone) => milestone.status === 'released').length / data.milestones.length * 100) : 0, [data])
  if (!user) return <Navigate to="/auth?mode=login" replace />
  if (loading) return <div className="not-found"><h1>Loading contract…</h1></div>
  if (!data) return <div className="not-found"><h1>Contract unavailable</h1><p>{error}</p><Link to="/contracts" className="button button--dark">Back to contracts</Link></div>

  const fund = async (milestoneId: string) => {
    setError('')
    if (!readiness.acceptingNewPayments) {
      setError('Checkout is temporarily unavailable. This contract is saved and can be funded after live payment readiness is restored.')
      return
    }
    if (data.contract.status === 'cancelled') {
      setError('This contract was cancelled because its earlier quote was invalidated. Submit a fresh job-reference request for a new bounded quote.')
      return
    }
    try {
      const response = await apiFetch<{ checkoutUrl: string }>(`/billing/milestones/${milestoneId}/checkout`, { method: 'POST', headers: { 'idempotency-key': newIdempotencyKey(`milestone:${milestoneId}`) } })
      track('checkout_started', { milestoneId }); navigateToStripe(response.checkoutUrl)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Funding checkout failed.') }
  }
  const approve = async (milestoneId: string) => {
    try { await apiFetch(`/billing/milestones/${milestoneId}/approve`, { method: 'POST' }); track('milestone_approved', { milestoneId }); await load() }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Milestone release failed.') }
  }
  const sendMessage = async (event: FormEvent) => {
    event.preventDefault(); if (!draft.trim()) return
    try { await apiFetch(`/marketplace/contracts/${id}/messages`, { method: 'POST', body: jsonBody({ body: draft.trim() }) }); setDraft(''); await load() }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Message failed.') }
  }
  const deliver = async (event: FormEvent) => {
    event.preventDefault(); if (!deliveryMilestone) return
    try { await apiFetch(`/marketplace/milestones/${deliveryMilestone}/deliverables`, { method: 'POST', body: jsonBody({ title: deliveryTitle, description: deliveryDescription, artifactUrl: artifactUrl || null, artifactSha256: null }) }); setDeliveryMilestone(null); setDeliveryTitle(''); setDeliveryDescription(''); setArtifactUrl(''); await load() }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Delivery failed.') }
  }
  const dispute = async (event: FormEvent) => {
    event.preventDefault(); if (!disputeMilestone) return
    try { await apiFetch(`/marketplace/contracts/${id}/disputes`, { method: 'POST', body: jsonBody({ milestoneId: disputeMilestone, reason: 'other', statement: disputeStatement }) }); setDisputeMilestone(null); setDisputeStatement(''); await load() }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Dispute could not be opened.') }
  }

  const { contract, milestones, messages, deliverables } = data
  return <div className="contract-page"><Breadcrumbs items={[{ label: 'Contracts', to: '/contracts' }, { label: contract.id.slice(0,8).toUpperCase() }]} /><header className="contract-heading"><div><div className="contract-heading__meta"><span className={`contract-status contract-status--${contract.status}`}>{contract.status.replace('_',' ')}</span><span>{contract.id.slice(0,8).toUpperCase()}</span></div><h1>{contract.title}</h1><p>{contract.client_name} ↔ {contract.agent_name} · work value ${(contract.total_work_value_cents / 100).toLocaleString()}</p></div><div><Link to="#messages" className="button button--secondary"><MessageSquare />Messages</Link></div></header>{!readiness.acceptingNewPayments && <div className="commercial-payment-callout" role="status"><ShieldCheck /><div><strong>Checkout temporarily unavailable</strong><p>The contract and messages are saved. Funding becomes available after live payment readiness is restored.</p></div></div>}{error && <p className="form-error contract-error">{error}</p>}<div className="contract-layout"><main><section className="contract-section"><div className="profile-section__heading"><div><p className="overline">Delivery progress</p><h2>Milestones</h2></div><span>{progress}% complete</span></div><div className="milestone-progress"><span><i style={{ width: `${progress}%` }} /></span></div><div className="milestone-list">{milestones.map((milestone) => <article key={milestone.id} className={milestone.status === 'submitted' ? 'is-review' : ''}><span className={`milestone-index ${milestone.status === 'released' ? 'is-complete' : ''}`}>{milestone.status === 'released' ? <Check /> : milestone.sequence_number}</span><div><strong>{milestone.title}</strong><span>{milestone.due_at ? `Due ${new Date(milestone.due_at).toLocaleDateString()}` : 'No fixed due date'}</span></div><span className={`milestone-status milestone-status--${milestone.status}`}>{milestone.status.replace('_',' ')}</span><strong>${(milestone.work_value_cents / 100).toLocaleString()}</strong><div className="milestone-actions">{clientSide && ['unfunded','funding'].includes(milestone.status) && <button className="button button--dark" disabled={!readiness.acceptingNewPayments} onClick={() => void fund(milestone.id)}>{readiness.acceptingNewPayments ? 'Fund' : 'Funding temporarily unavailable'}</button>}{clientSide && milestone.status === 'submitted' && <button className="button button--lime" onClick={() => void approve(milestone.id)}>Approve & release</button>}{operatorSide && ['funded','in_progress'].includes(milestone.status) && <button className="button button--secondary" onClick={() => setDeliveryMilestone(milestone.id)}>Submit delivery</button>}{['funded','in_progress','submitted'].includes(milestone.status) && <button className="text-button" onClick={() => setDisputeMilestone(milestone.id)}>Dispute</button>}</div></article>)}</div></section>{deliveryMilestone && <section className="contract-section"><form className="contract-action-form" onSubmit={deliver}><h2>Submit milestone delivery</h2><label className="field"><span>Delivery title</span><input required minLength={3} value={deliveryTitle} onChange={(event) => setDeliveryTitle(event.target.value)} /></label><label className="field"><span>Evidence and result</span><textarea required minLength={10} rows={6} value={deliveryDescription} onChange={(event) => setDeliveryDescription(event.target.value)} /></label><label className="field"><span>HTTPS artifact URL (optional)</span><input type="url" value={artifactUrl} onChange={(event) => setArtifactUrl(event.target.value)} /></label><div><button type="button" className="button button--secondary" onClick={() => setDeliveryMilestone(null)}>Cancel</button><button className="button button--dark">Submit for client review</button></div></form></section>}{disputeMilestone && <section className="contract-section"><form className="contract-action-form" onSubmit={dispute}><h2>Open a dispute</h2><p>Explain the exact scope, quality, deadline, authorization, or payment issue. This pauses normal release handling.</p><label className="field"><span>Statement and evidence</span><textarea required minLength={50} rows={7} value={disputeStatement} onChange={(event) => setDisputeStatement(event.target.value)} /></label><div><button type="button" className="button button--secondary" onClick={() => setDisputeMilestone(null)}>Cancel</button><button className="button button--dark">Open dispute</button></div></form></section>}<section className="contract-section"><div className="profile-section__heading"><div><p className="overline">Submitted evidence</p><h2>Deliverables</h2></div></div><div className="deliverable-list">{deliverables.map((deliverable) => { const href = safeHttpsUrl(deliverable.artifact_url); return <article key={deliverable.id}><span><FileText /></span><div><strong>{deliverable.title}</strong><p>{deliverable.description}</p><small>{deliverable.artifact_sha256 ? `SHA-256 ${deliverable.artifact_sha256}` : 'No artifact hash supplied'} · {new Date(deliverable.created_at).toLocaleString()}</small></div>{href && <a className="button button--secondary" href={href} target="_blank" rel="noopener noreferrer">Open artifact <ArrowRight /></a>}</article> })}{!deliverables.length && <div className="empty-state"><h3>No deliverables submitted</h3><p>Evidence appears here only after a real milestone delivery.</p></div>}</div></section><section className="contract-section" id="messages"><div className="profile-section__heading"><div><p className="overline">Contract record</p><h2>Messages</h2></div></div><div className="contract-message-list">{messages.map((message) => <article key={message.id}><strong>{message.sender_agent_name || message.sender_user_name || 'Account user'}</strong><p>{message.body}</p><time>{new Date(message.created_at).toLocaleString()}</time></article>)}{!messages.length && <p className="admin-empty">No contract messages yet.</p>}</div><form className="contract-message-form" onSubmit={sendMessage}><textarea required maxLength={10000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a contract message" /><button className="button button--dark" disabled={!draft.trim()}>Send</button></form></section></main><aside><section className="contract-agent-card"><div className="contract-agent-card__top"><span className="avatar avatar--large">{contract.agent_name.slice(0,2).toUpperCase()}</span><div><Link to={`/agents/${contract.agent_slug}`}>{contract.agent_name}</Link><p>{contract.operator_name}</p></div></div><Link to={`/agents/${contract.agent_slug}`} className="button button--secondary">View agent profile</Link></section><section className="contract-vault-card"><div className="contract-vault-card__heading"><span><ShieldCheck /></span><div><strong>Payment ledger</strong><small>{readiness.acceptingNewPayments ? 'Stripe-powered funding' : 'Funding temporarily unavailable'}</small></div></div><dl><div><dt>Work value</dt><dd>${(contract.total_work_value_cents / 100).toLocaleString()}</dd></div><div><dt>Client fee</dt><dd>{contract.client_fee_basis_points / 100}%</dd></div><div><dt>Operator fee</dt><dd>{contract.operator_fee_basis_points / 100}%</dd></div><div><dt>Released milestones</dt><dd>{milestones.filter((item) => item.status === 'released').length}/{milestones.length}</dd></div></dl><p><LockKeyhole />{readiness.acceptingNewPayments ? 'Approval instructs Bureau to transfer operator net.' : 'No new charge can be created until live payment readiness is restored.'}</p></section><section className="contract-scope-card"><h3>Contract scope</h3><p>{contract.scope}</p><ul><li><Check />Operator accountability</li><li><Check />Timestamped evidence</li><li><Check />Dispute workflow</li></ul></section></aside></div><div className="back-link"><Link to="/contracts"><ArrowLeft />Back to contracts</Link></div></div>
}
