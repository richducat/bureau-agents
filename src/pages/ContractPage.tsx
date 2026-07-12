import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  GitPullRequest,
  LockKeyhole,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Play,
  ShieldCheck,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { AgentMark, Breadcrumbs, Rating, StatusDot } from '../components/Common'
import { agents } from '../data'
import { useApp } from '../context/AppContext'

export default function ContractPage() {
  const { id } = useParams()
  const { contracts, approveMilestone, showToast, role } = useApp()
  const contract = contracts.find((item) => item.id === id)

  if (!contract) return <div className="not-found"><h1>Contract not found</h1><Link to="/contracts" className="button button--dark">Back to contracts</Link></div>
  const agent = agents.find((item) => item.id === contract.agentId)!
  const reviewMilestone = contract.milestones.find((milestone) => milestone.status === 'Pending review')

  return (
    <div className="contract-page">
      <Breadcrumbs items={[{ label: 'Contracts', to: '/contracts' }, { label: contract.id.toUpperCase() }]} />
      <header className="contract-heading">
        <div><div className="contract-heading__meta"><span className={`contract-status contract-status--${contract.status.toLowerCase()}`}>{contract.status}</span><span>{contract.id.toUpperCase()}</span></div><h1>{contract.title}</h1><p>Started {contract.started} · Due {contract.due}</p></div>
        <div><Link to="/messages" className="button button--secondary"><MessageSquare size={16} /> Message agent</Link><button className="icon-button icon-button--large" onClick={() => showToast('Contract actions opened')}><MoreHorizontal size={19} /></button></div>
      </header>

      {reviewMilestone && (
        <section className={`review-banner ${role === 'agent' ? 'review-banner--waiting' : ''}`}>
          <span className="review-banner__icon"><FileCheck2 size={21} /></span>
          <div><p className="overline">{role === 'client' ? 'Your review is requested' : 'Submitted for client review'}</p><h2>{reviewMilestone.title}</h2><p>{role === 'client' ? `The agent submitted artifacts and verification evidence for milestone ${contract.milestones.indexOf(reviewMilestone) + 1}.` : 'Your delivery is locked with its evidence record while the client reviews the milestone.'}</p></div>
          <div><strong>${reviewMilestone.amount.toLocaleString()}</strong><span>funded in Vault</span></div>
          {role === 'client' ? <button className="button button--lime" onClick={() => { approveMilestone(contract.id, reviewMilestone.id); showToast(`Milestone approved — $${reviewMilestone.amount.toLocaleString()} released`) }}>Approve & release <ArrowRight size={16} /></button> : <span className="review-banner__waiting"><Clock3 size={14} /> Awaiting client</span>}
        </section>
      )}

      <div className="contract-layout">
        <main>
          <section className="contract-section">
            <div className="profile-section__heading"><div><p className="overline">Delivery progress</p><h2>Milestones</h2></div><span>{contract.progress}% complete</span></div>
            <div className="milestone-progress"><span><i style={{ width: `${contract.progress}%` }} /></span></div>
            <div className="milestone-list">
              {contract.milestones.map((milestone, index) => (
                <article key={milestone.id} className={milestone.status === 'Pending review' ? 'is-review' : ''}>
                  <span className={`milestone-index ${milestone.status === 'Released' ? 'is-complete' : ''}`}>{milestone.status === 'Released' ? <Check size={15} /> : index + 1}</span>
                  <div><strong>{milestone.title}</strong><span>Due {milestone.due}</span></div>
                  <span className={`milestone-status milestone-status--${milestone.status.toLowerCase().replace(' ', '-')}`}>{milestone.status}</span>
                  <strong>${milestone.amount.toLocaleString()}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="contract-section">
            <div className="profile-section__heading"><div><p className="overline">Auditable execution</p><h2>Run activity</h2></div><button className="text-button" onClick={() => showToast('Full audit log exported')}>Export log <ArrowRight size={15} /></button></div>
            <div className="contract-activity">
              {contract.activity.map((item) => {
                const Icon = item.type === 'run' ? Activity : item.type === 'artifact' ? FileText : item.type === 'payment' ? CircleDollarSign : MessageSquare
                return <article key={item.id}><span className={`activity-icon activity-icon--${item.type}`}><Icon size={15} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time}</time>{item.type === 'artifact' && <button className="button button--secondary" onClick={() => showToast('Artifact preview opened')}>Open evidence</button>}</article>
              })}
            </div>
          </section>

          <section className="contract-section evidence-section">
            <div className="profile-section__heading"><div><p className="overline">Submitted evidence</p><h2>Artifacts</h2></div></div>
            <button onClick={() => showToast('Market map preview opened')}><span><FileText size={19} /></span><div><strong>market-map-v3.pdf</strong><small>PDF · 4.8 MB · Verified checksum</small></div><ArrowRight size={16} /></button>
            <button onClick={() => showToast('Source archive preview opened')}><span><Paperclip size={19} /></span><div><strong>source-archive.csv</strong><small>CSV · 128 rows · Field provenance included</small></div><ArrowRight size={16} /></button>
            <button onClick={() => showToast('Validation report preview opened')}><span><CheckCircle2 size={19} /></span><div><strong>validation-report.json</strong><small>JSON · 126/128 claims corroborated</small></div><ArrowRight size={16} /></button>
          </section>
        </main>

        <aside>
          <section className="contract-agent-card">
            <div className="contract-agent-card__top"><AgentMark agent={agent} size="large" /><div><Link to={`/agents/${agent.id}`}>{agent.name}</Link><p>{agent.specialty}</p></div></div>
            <div className="contract-agent-card__meta"><Rating rating={agent.rating} reviews={agent.reviews} /><StatusDot online={agent.online} /></div>
            <Link to={`/agents/${agent.id}`} className="button button--secondary">View agent profile</Link>
          </section>

          <section className="contract-vault-card">
            <div className="contract-vault-card__heading"><span><ShieldCheck size={18} /></span><div><strong>Bureau Vault</strong><small>Milestone protection</small></div></div>
            <dl><div><dt>Contract value</dt><dd>${contract.value.toLocaleString()}</dd></div><div><dt>Released</dt><dd>${contract.milestones.filter((item) => item.status === 'Released').reduce((sum, item) => sum + item.amount, 0).toLocaleString()}</dd></div><div><dt>Protected</dt><dd>${contract.milestones.filter((item) => item.status !== 'Released').reduce((sum, item) => sum + item.amount, 0).toLocaleString()}</dd></div></dl>
            <p><LockKeyhole size={14} /> Funds release only on your approval.</p>
          </section>

          <section className="contract-scope-card">
            <h3>Contract controls</h3>
            <ul><li><Check size={13} />Public web and supplied files</li><li><Check size={13} />No external contact</li><li><Check size={13} />No publishing rights</li><li><Check size={13} />Source citation required</li></ul>
            <button onClick={() => showToast('Scope and permissions opened')}>View scope & permissions <ArrowRight size={14} /></button>
          </section>
        </aside>
      </div>
      <div className="back-link"><Link to="/contracts"><ArrowLeft size={15} /> Back to contracts</Link></div>
    </div>
  )
}
