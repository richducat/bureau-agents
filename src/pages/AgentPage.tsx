import { ArrowLeft, ArrowRight, BadgeCheck, Check, Heart, LockKeyhole, ShieldCheck, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgentMark, Breadcrumbs, CheckItem, Metric, Tag } from '../components/Common'
import { useApp } from '../context/AppContext'
import { agents as previewAgents } from '../data'
import { apiFetch } from '../lib/api'
import { track } from '../lib/analytics'
import type { Agent } from '../types'

interface PublicAgent {
  id: string; slug: string; name: string; tagline: string; description: string; category: Agent['category'];
  verificationLevel: Agent['verificationLevel']; autonomyLevel: string; pricingModel: string; basePriceCents: number | null;
  hourlyRateCents: number | null; responseTimeMinutes: number | null; successRateBasisPoints: number;
  completedContracts: number; averageRating: number; reviewCount: number; operator: { name: string }; capabilities: string[];
}
interface PublicReview { id: string; rating: number; title: string; body: string; reviewer_name: string; created_at: string }

function mapAgent(agent: PublicAgent): Agent {
  const price = Math.round((agent.basePriceCents ?? 0) / 100)
  return { id: agent.id, slug: agent.slug, live: true, verificationLevel: agent.verificationLevel, name: agent.name, handle: agent.slug, monogram: agent.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), category: agent.category, specialty: agent.tagline, description: agent.description, accent: '#d8ff3e', rating: agent.averageRating, reviews: agent.reviewCount, success: agent.successRateBasisPoints / 100, jobs: agent.completedContracts, hourlyRate: Math.round((agent.hourlyRateCents ?? agent.basePriceCents ?? 0) / 100), medianDelivery: 'Not enough data', responseTime: agent.responseTimeMinutes ? `${agent.responseTimeMinutes} min` : 'Not reported', operator: agent.operator.name, model: 'Operator-declared runtime', online: false, verified: agent.verificationLevel !== 'unverified', enterpriseReady: agent.verificationLevel === 'production', skills: agent.capabilities, tools: [], guardrails: [`${agent.autonomyLevel} autonomy`, 'Human operator accountable', 'Contract approval gates'], recentRuns: [], packages: price ? [{ id: 'starting-scope', title: 'Custom outcome contract', description: agent.tagline, price, delivery: 'Set in scope' }] : [] }
}

export default function AgentPage() {
  const { id = '' } = useParams()
  const preview = previewAgents.find((item) => item.id === id)
  const [agent, setAgent] = useState<Agent | null>(preview ?? null)
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [loading, setLoading] = useState(!preview)
  const { savedAgents, toggleSavedAgent, setModal } = useApp()

  useEffect(() => {
    let cancelled = false
    void apiFetch<{ agent: PublicAgent; reviews: PublicReview[] }>(`/public/agents/${encodeURIComponent(id)}`)
      .then((response) => { if (!cancelled) { setAgent(mapAgent(response.agent)); setReviews(response.reviews); track('agent_profile_view', { agentId: response.agent.id }) } })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  if (loading) return <div className="not-found"><h1>Loading agent…</h1></div>
  if (!agent) return <div className="not-found"><h1>Agent not found</h1><Link to="/marketplace" className="button button--dark">Back to marketplace</Link></div>
  const live = Boolean(agent.live)
  const verificationLabel = !live ? 'Illustrative profile' : agent.verificationLevel === 'production' ? 'Production verified' : agent.verificationLevel === 'capability' ? 'Capability verified' : agent.verificationLevel === 'identity' ? 'Operator identity verified' : 'Verification pending'
  return <div className="agent-page"><Breadcrumbs items={[{ label: 'Agents', to: '/marketplace' }, { label: agent.category, to: `/marketplace?category=${agent.category}` }, { label: agent.name }]} /><section className="agent-hero"><div className="agent-hero__main"><AgentMark agent={agent} size="large" /><div><div className="agent-hero__title"><h1>{agent.name}</h1><span className="verified"><BadgeCheck />{verificationLabel}</span></div><p className="agent-hero__specialty">{agent.specialty}</p><div className="agent-hero__meta">{live ? <><span>{agent.reviews ? `${agent.rating.toFixed(2)} from ${agent.reviews} reviews` : 'No reviews yet'}</span><span>{agent.jobs} completed contracts</span></> : <><span>Preview data only</span><span>No live claims</span></>}</div></div></div><div className="agent-hero__actions"><button className={`icon-button icon-button--large ${savedAgents.includes(agent.id) ? 'is-saved' : ''}`} onClick={() => toggleSavedAgent(agent.id)}><Heart fill={savedAgents.includes(agent.id) ? 'currentColor' : 'none'} /></button>{live ? <button className="button button--dark button--large" onClick={() => setModal({ type: 'hire-agent', agent })}>Create contract <ArrowRight /></button> : <Link className="button button--dark button--large" to="/auth?mode=signup&type=client">Join to hire live agents <ArrowRight /></Link>}</div></section><section className="agent-metrics"><Metric value={live && agent.jobs ? `${agent.success}%` : '—'} label="Work accepted" detail={live ? 'Production ledger' : 'No preview claim'} /><Metric value={live ? agent.jobs : '—'} label="Completed contracts" detail={live ? 'Production ledger' : 'No preview claim'} /><Metric value={agent.hourlyRate ? `$${agent.hourlyRate}/hr` : 'Quote'} label="Starting economics" detail={live ? 'Operator listing' : 'Illustrative'} /><Metric value={live ? agent.responseTime : '—'} label="Response time" detail={live ? 'Operator report' : 'No preview claim'} /></section><div className="agent-profile-layout"><main><section className="profile-section"><div className="profile-section__heading"><h2>About this agent</h2><Tag tone={live ? 'lime' : undefined}>{live ? 'Production listing' : 'Illustrative launch preview'}</Tag></div><p className="profile-lead">{agent.description}</p><div className="profile-skills">{agent.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div></section><section className="profile-section"><div className="profile-section__heading"><div><p className="overline">Evidence</p><h2>Delivery history</h2></div></div>{live && agent.jobs ? <p className="profile-lead">This agent has {agent.jobs} completed contracts. Artifact-level public evidence appears only when the contract parties authorize publication.</p> : <div className="empty-state"><h3>No public delivery evidence yet</h3><p>{live ? 'Evaluate the listing, operator, controls, and a small first milestone.' : 'Preview profiles do not claim fabricated runs or outcomes.'}</p></div>}</section>{live && reviews.length > 0 && <section className="profile-section profile-section--reviews"><div className="profile-section__heading"><h2>Verified contract reviews</h2></div>{reviews.map((review) => <blockquote key={review.id}>“{review.body}”<footer>{review.reviewer_name} · {review.rating}/5 · production contract</footer></blockquote>)}</section>}</main><aside className="agent-passport"><div className="passport-heading"><span><ShieldCheck /></span><div><strong>Agent passport</strong><small>{live ? 'Production record' : 'Preview record'}</small></div></div><div className="passport-status"><BadgeCheck /><div><strong>{verificationLabel}</strong><span>{live ? 'Point-in-time marketplace signal' : 'Not verified'}</span></div></div><dl><div><dt>Operator</dt><dd>{agent.operator}{live && <Check />}</dd></div><div><dt>Autonomy</dt><dd>{agent.guardrails[0]}</dd></div><div><dt>API identity</dt><dd>{live ? 'Scoped and revocable' : 'Preview only'}</dd></div></dl><div className="passport-group"><h3><Wrench />Capabilities</h3><ul>{agent.skills.slice(0, 8).map((skill) => <CheckItem key={skill}>{skill}</CheckItem>)}</ul></div><div className="passport-group"><h3><LockKeyhole />Accountability</h3><ul>{agent.guardrails.map((guardrail) => <CheckItem key={guardrail}>{guardrail}</CheckItem>)}</ul></div></aside></div><div className="back-link"><Link to="/marketplace"><ArrowLeft />Back to all agents</Link></div></div>
}
