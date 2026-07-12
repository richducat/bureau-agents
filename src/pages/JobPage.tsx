import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  Flag,
  Globe2,
  LockKeyhole,
  MessageSquare,
  ShieldAlert,
  Star,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AgentMark, Breadcrumbs, CheckItem, Rating, StatusDot, Tag } from '../components/Common'
import { agents } from '../data'
import { useApp } from '../context/AppContext'

export default function JobPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { jobs, role, setModal, showToast } = useApp()
  const job = jobs.find((item) => item.id === id)

  if (!job) return <div className="not-found"><h1>Work request not found</h1><Link to="/jobs" className="button button--dark">Back to open work</Link></div>

  const matches = agents
    .map((agent) => ({ agent, score: agent.category === job.category ? 98 : Math.max(72, 87 - Math.abs(agent.hourlyRate - job.budgetMin) / 4) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return (
    <div className="job-page">
      <Breadcrumbs items={[{ label: 'Open work', to: '/jobs' }, { label: job.category, to: `/jobs?q=${job.category}` }, { label: job.title }]} />

      <div className="job-detail-layout">
        <main className="job-detail">
          <div className="job-detail__heading">
            <div className="job-detail__meta"><Tag tone={job.featured ? 'lime' : undefined}>{job.featured ? 'Priority match' : job.category}</Tag><span>Posted {job.posted}</span><span>Work ID {job.id.slice(0, 8).toUpperCase()}</span></div>
            <h1>{job.title}</h1>
            <div className="job-detail__terms">
              <span><Banknote size={17} /><strong>{job.pricing === 'Fixed' ? `$${job.budgetMin.toLocaleString()}–${job.budgetMax.toLocaleString()}` : `$${job.budgetMin}–${job.budgetMax}/hr`}</strong><small>{job.pricing} price</small></span>
              <span><CalendarDays size={17} /><strong>{job.duration}</strong><small>Expected duration</small></span>
              <span><BriefcaseBusiness size={17} /><strong>{job.experience}</strong><small>Agent history</small></span>
              <span><Bot size={17} /><strong>{job.proposals}</strong><small>Proposals</small></span>
            </div>
          </div>

          <section className="job-detail__section">
            <h2>Scope</h2>
            <p className="job-detail__description">{job.description}</p>
          </section>

          <section className="job-detail__section job-detail__split">
            <div><h2><FileCheck2 size={18} /> Acceptance deliverables</h2><ul>{job.deliverables.map((item) => <CheckItem key={item}>{item}</CheckItem>)}</ul></div>
            <div><h2><LockKeyhole size={18} /> Approved access</h2><ul>{job.access.map((item) => <CheckItem key={item}>{item}</CheckItem>)}</ul></div>
          </section>

          <section className="job-detail__section">
            <h2>Required capabilities</h2>
            <div className="profile-skills">{job.skills.map((skill) => <Tag key={skill}>{skill}</Tag>)}</div>
          </section>

          <section className="job-detail__section job-detail__guardrails">
            <div className={`risk-badge risk-badge--${job.risk.toLowerCase()}`}><ShieldAlert size={17} /> {job.risk} risk</div>
            <div><h3>Execution boundaries</h3><p>Work must stay inside the listed systems and data. Publishing, external contact, payments, destructive actions, and access expansion require explicit client approval.</p></div>
          </section>

          {role === 'client' && (
            <section className="job-detail__section matched-agents">
              <div className="profile-section__heading"><div><p className="overline">Bureau match</p><h2>Agents likely to deliver</h2></div><Link to="/marketplace" className="text-button">Browse all <ArrowRight size={15} /></Link></div>
              {matches.map(({ agent, score }) => (
                <article key={agent.id}>
                  <AgentMark agent={agent} />
                  <div className="matched-agent__identity"><Link to={`/agents/${agent.id}`}>{agent.name}</Link><p>{agent.specialty}</p><span><Rating rating={agent.rating} /> · {agent.jobs} jobs</span></div>
                  <div className="match-score"><strong>{Math.round(score)}%</strong><span>scope match</span></div>
                  <div><strong>${agent.hourlyRate}/hr</strong><StatusDot online={agent.online} /></div>
                  <button className="button button--secondary" onClick={() => setModal({ type: 'hire-agent', agent })}>Invite</button>
                </article>
              ))}
            </section>
          )}
        </main>

        <aside className="job-sidebar">
          {role === 'agent' ? (
            <div className="job-action-box">
              <span className="job-action-box__icon"><Bot size={21} /></span>
              <h2>Submit your agent</h2>
              <p>Propose an approach, price, timing, and the evidence the client will receive.</p>
              <button className="button button--lime button--large" onClick={() => setModal({ type: 'submit-proposal', job })}>Submit proposal <ArrowRight size={17} /></button>
              <small>No proposal credits. Bureau charges only on accepted work.</small>
            </div>
          ) : (
            <div className="job-action-box">
              <span className="job-action-box__icon"><BriefcaseBusiness size={21} /></span>
              <h2>Manage this scope</h2>
              <p>Invite matched agents or edit the acceptance criteria before contracting.</p>
              <button className="button button--lime button--large" onClick={() => { showToast('Invite panel opened with 3 matched agents'); document.querySelector('.matched-agents')?.scrollIntoView({ behavior: 'smooth' }) }}>Invite matched agents <ArrowRight size={17} /></button>
              <button className="button button--line-light" onClick={() => showToast('Scope duplicated to a new draft')}>Duplicate scope</button>
            </div>
          )}

          <div className="client-card">
            <div className="client-card__top"><span className="avatar avatar--large">{job.client.initials}</span><div><strong>{job.client.name}</strong><span>{job.client.verified && <BadgeCheck size={14} />} Payment verified</span></div></div>
            <dl>
              <div><dt>Marketplace spend</dt><dd>{job.client.spend}</dd></div>
              <div><dt>Agent hires</dt><dd>{job.client.hires}</dd></div>
              <div><dt>Agent rating</dt><dd><Star size={13} fill="currentColor" /> {job.client.rating}</dd></div>
              <div><dt>Location</dt><dd><Globe2 size={13} /> {job.client.location}</dd></div>
            </dl>
            <p><Check size={14} /> Funds available for this work</p>
          </div>

          <button className="job-report" onClick={() => showToast('Thanks. This work request was sent to Trust & Safety.')}><Flag size={14} /> Report this work request</button>
        </aside>
      </div>
      <div className="back-link"><button onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back to open work</button></div>
    </div>
  )
}
