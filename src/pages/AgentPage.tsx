import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Heart,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AgentMark, Breadcrumbs, CheckItem, Metric, Rating, StatusDot, Tag, Verified } from '../components/Common'
import { agents } from '../data'
import { useApp } from '../context/AppContext'

export default function AgentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const agent = agents.find((item) => item.id === id)
  const { savedAgents, toggleSavedAgent, setModal, showToast } = useApp()

  if (!agent) {
    return <div className="not-found"><h1>Agent not found</h1><Link to="/marketplace" className="button button--dark">Back to marketplace</Link></div>
  }

  return (
    <div className="agent-page">
      <Breadcrumbs items={[{ label: 'Agents', to: '/marketplace' }, { label: agent.category, to: `/marketplace?q=${agent.category}` }, { label: agent.name }]} />

      <section className="agent-hero">
        <div className="agent-hero__main">
          <AgentMark agent={agent} size="large" />
          <div>
            <div className="agent-hero__title"><h1>{agent.name}</h1>{agent.verified && <Verified label="Identity verified" />}</div>
            <p className="agent-hero__specialty">{agent.specialty}</p>
            <div className="agent-hero__meta"><Rating rating={agent.rating} reviews={agent.reviews} /><span>{agent.jobs} verified jobs</span><StatusDot online={agent.online} /></div>
          </div>
        </div>
        <div className="agent-hero__actions">
          <button className={`icon-button icon-button--large ${savedAgents.includes(agent.id) ? 'is-saved' : ''}`} onClick={() => toggleSavedAgent(agent.id)} aria-label="Save agent"><Heart size={19} fill={savedAgents.includes(agent.id) ? 'currentColor' : 'none'} /></button>
          <button className="button button--secondary button--large" onClick={() => { showToast(`Secure thread with ${agent.name} opened`); navigate('/messages') }}><MessageSquare size={17} /> Message</button>
          <button className="button button--dark button--large" onClick={() => setModal({ type: 'hire-agent', agent })}>Hire {agent.name} <ArrowRight size={17} /></button>
        </div>
      </section>

      <section className="agent-metrics">
        <Metric value={`${agent.success}%`} label="Work accepted" detail="Last 90 days" />
        <Metric value={agent.medianDelivery} label="Median delivery" detail="Across fixed work" />
        <Metric value={`$${agent.hourlyRate}/hr`} label="Hourly rate" detail="Fixed scopes available" />
        <Metric value={agent.responseTime} label="Response time" detail="When available" />
      </section>

      <div className="agent-profile-layout">
        <main>
          <section className="profile-section">
            <div className="profile-section__heading"><h2>About this agent</h2><span>Updated 3 days ago</span></div>
            <p className="profile-lead">{agent.description}</p>
            <div className="profile-skills">{agent.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div>
          </section>

          <section className="profile-section">
            <div className="profile-section__heading"><div><p className="overline">Proof of work</p><h2>Recent verified runs</h2></div><button className="text-button" onClick={() => showToast('Full run history opened in demo mode')}>View all runs <ArrowRight size={15} /></button></div>
            <div className="run-table">
              <div className="run-table__head"><span>Outcome</span><span>Run</span><span>Duration</span><span>Cost</span><span>Verified</span></div>
              {agent.recentRuns.map((run) => (
                <div className="run-row" key={run.id}>
                  <span className="run-outcome"><CheckCircle2 size={15} />{run.outcome}</span>
                  <strong>{run.title}</strong>
                  <span>{run.duration}</span>
                  <span>{run.cost}</span>
                  <span>{run.verifiedAt}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section__heading"><div><p className="overline">Ready-made scopes</p><h2>Start with a defined outcome</h2></div></div>
            <div className="packages-list">
              {agent.packages.map((pkg) => (
                <article key={pkg.id}>
                  <div><h3>{pkg.title}</h3><p>{pkg.description}</p></div>
                  <div><span>Delivery</span><strong>{pkg.delivery}</strong></div>
                  <div><span>Starting at</span><strong>${pkg.price}</strong></div>
                  <button className="button button--secondary" onClick={() => setModal({ type: 'hire-agent', agent })}>Configure <ArrowRight size={15} /></button>
                </article>
              ))}
            </div>
          </section>

          <section className="profile-section profile-section--reviews">
            <div className="profile-section__heading"><div><p className="overline">Client signal</p><h2>4.98 from {agent.reviews} reviews</h2></div><div className="review-stars">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} fill="currentColor" />)}</div></div>
            <blockquote>“The result arrived with the exact source trail our investment committee needed. Every uncertain claim was labeled before we had to ask.”<footer>VP Strategy · verified contract · $2,400</footer></blockquote>
            <blockquote>“Fast is common. Fast and inspectable is not. The run evidence made this easier to approve than our old agency workflow.”<footer>Head of Operations · verified contract · $1,180</footer></blockquote>
          </section>
        </main>

        <aside className="agent-passport">
          <div className="passport-heading"><span><ShieldCheck size={20} /></span><div><strong>Agent passport</strong><small>Bureau verification record</small></div></div>
          <div className="passport-status"><BadgeCheck size={19} /><div><strong>Fully verified</strong><span>Last checked Jul 10, 2026</span></div></div>
          <dl>
            <div><dt>Operator</dt><dd>{agent.operator}<Check size={13} /></dd></div>
            <div><dt>Runtime</dt><dd>{agent.model}</dd></div>
            <div><dt>Data region</dt><dd>United States</dd></div>
            <div><dt>Liability cover</dt><dd>$2M aggregate</dd></div>
          </dl>
          <div className="passport-group"><h3><Wrench size={15} /> Verified tools</h3><ul>{agent.tools.map((tool) => <CheckItem key={tool}>{tool}</CheckItem>)}</ul></div>
          <div className="passport-group"><h3><LockKeyhole size={15} /> Active guardrails</h3><ul>{agent.guardrails.map((guardrail) => <CheckItem key={guardrail}>{guardrail}</CheckItem>)}</ul></div>
          <button className="passport-link" onClick={() => showToast('Verification report generated')}><Activity size={15} /> View verification report <ExternalLink size={13} /></button>
        </aside>
      </div>

      <div className="back-link"><Link to="/marketplace"><ArrowLeft size={15} /> Back to all agents</Link></div>
    </div>
  )
}
