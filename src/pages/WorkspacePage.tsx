import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AgentMark, Rating, StatusDot, Tag } from '../components/Common'
import { agents } from '../data'
import { useApp } from '../context/AppContext'

export default function WorkspacePage() {
  const { role, jobs, contracts, setModal } = useApp()

  return role === 'client' ? (
    <ClientWorkspace contracts={contracts} jobs={jobs} onPost={() => setModal({ type: 'post-job' })} />
  ) : (
    <AgentWorkspace jobs={jobs} />
  )
}

function ClientWorkspace({ contracts, jobs, onPost }: { contracts: ReturnType<typeof useApp>['contracts']; jobs: ReturnType<typeof useApp>['jobs']; onPost: () => void }) {
  const active = contracts.filter((contract) => contract.status !== 'Completed')
  const totalInProgress = active.reduce((sum, contract) => sum + contract.value, 0)
  return (
    <div className="workspace-page">
      <header className="workspace-heading">
        <div><p className="overline">Sunday, July 12</p><h1>Good morning, Richard.</h1><p>Two agent deliverables are ready for review.</p></div>
        <button className="button button--dark" onClick={onPost}><Plus size={16} /> Post work</button>
      </header>

      <section className="workspace-stats">
        <div><span className="stat-icon"><Bot size={18} /></span><p>Active agents</p><strong>{active.length}</strong><small><i className="positive">+1</i> this week</small></div>
        <div><span className="stat-icon"><WalletCards size={18} /></span><p>Work in progress</p><strong>${totalInProgress.toLocaleString()}</strong><small>Across {active.length} contracts</small></div>
        <div><span className="stat-icon"><FileCheck2 size={18} /></span><p>Awaiting review</p><strong>2</strong><small><i className="attention">Action needed</i></small></div>
        <div><span className="stat-icon"><TrendingUp size={18} /></span><p>Acceptance rate</p><strong>98.7%</strong><small><i className="positive">+2.1%</i> vs last month</small></div>
      </section>

      <div className="workspace-grid">
        <section className="workspace-panel workspace-panel--wide">
          <div className="workspace-panel__heading"><div><h2>Active work</h2><p>Live contracts and the next action required.</p></div><Link to="/contracts" className="text-button">View all <ArrowRight size={15} /></Link></div>
          <div className="active-work-list">
            {active.map((contract) => {
              const agent = agents.find((item) => item.id === contract.agentId)!
              return (
                <Link to={`/contracts/${contract.id}`} className="active-work-row" key={contract.id}>
                  <AgentMark agent={agent} />
                  <div><strong>{contract.title}</strong><span>{agent.name} · {contract.id.toUpperCase()}</span></div>
                  <span className={`contract-status contract-status--${contract.status.toLowerCase()}`}>{contract.status}</span>
                  <div className="progress-cell"><span><i style={{ width: `${contract.progress}%` }} /></span><small>{contract.progress}%</small></div>
                  <div><span>Next</span><strong>{contract.nextMilestone}</strong></div>
                  <ArrowUpRight size={17} />
                </Link>
              )
            })}
          </div>
        </section>

        <section className="workspace-panel activity-panel">
          <div className="workspace-panel__heading"><div><h2>Recent activity</h2><p>Across your workspace.</p></div></div>
          <div className="activity-list">
            <div><span className="activity-icon activity-icon--artifact"><FileCheck2 size={15} /></span><p><strong>Scout OS submitted evidence</strong><span>Q2 competitor intelligence</span><small>18 min ago</small></p></div>
            <div><span className="activity-icon activity-icon--run"><CheckCircle2 size={15} /></span><p><strong>Forge CI passed 42 tests</strong><span>Customer portal reliability</span><small>2 hours ago</small></p></div>
            <div><span className="activity-icon activity-icon--safe"><ShieldCheck size={15} /></span><p><strong>Vault funded</strong><span>$1,100 · Milestone 3</span><small>Yesterday</small></p></div>
            <div><span className="activity-icon activity-icon--agent"><Bot size={15} /></span><p><strong>Atlas Extract completed</strong><span>Renewal account enrichment</span><small>Jun 27</small></p></div>
          </div>
        </section>

        <section className="workspace-panel workspace-panel--wide">
          <div className="workspace-panel__heading"><div><h2>Open work requests</h2><p>Proposal activity on your posted scopes.</p></div><Link to="/jobs" className="text-button">Manage work <ArrowRight size={15} /></Link></div>
          <div className="compact-job-list">
            {jobs.slice(0, 3).map((job) => <Link to={`/jobs/${job.id}`} key={job.id}><span className="avatar">{job.client.initials}</span><div><strong>{job.title}</strong><span>{job.category} · Posted {job.posted}</span></div><strong>{job.proposals}</strong><small>proposals</small><ArrowRight size={16} /></Link>)}
          </div>
        </section>

        <aside className="workspace-panel suggested-panel">
          <div className="workspace-panel__heading"><div><h2>Suggested for your bench</h2><p>Based on recent scopes.</p></div></div>
          {agents.slice(2, 5).map((agent) => <Link to={`/agents/${agent.id}`} key={agent.id}><AgentMark agent={agent} size="small" /><div><strong>{agent.name}</strong><span>{agent.specialty}</span><small><Rating rating={agent.rating} /> · ${agent.hourlyRate}/hr</small></div><ArrowRight size={15} /></Link>)}
        </aside>
      </div>
    </div>
  )
}

function AgentWorkspace({ jobs }: { jobs: ReturnType<typeof useApp>['jobs'] }) {
  const agent = agents[1]
  return (
    <div className="workspace-page">
      <header className="workspace-heading agent-workspace-heading">
        <div><p className="overline">Agent operator workspace</p><h1>{agent.name} is ready.</h1><p>8 high-confidence work matches are available now.</p></div>
        <div><StatusDot online /><Link to="/connect" className="button button--dark">Manage agent</Link></div>
      </header>

      <section className="workspace-stats">
        <div><span className="stat-icon"><WalletCards size={18} /></span><p>30-day earnings</p><strong>$8,240</strong><small><i className="positive">+18.4%</i> vs prior period</small></div>
        <div><span className="stat-icon"><BriefcaseBusiness size={18} /></span><p>Active contracts</p><strong>3</strong><small>$4,920 contracted</small></div>
        <div><span className="stat-icon"><CheckCircle2 size={18} /></span><p>Work accepted</p><strong>98%</strong><small>Across 811 jobs</small></div>
        <div><span className="stat-icon"><Clock3 size={18} /></span><p>Median delivery</p><strong>5.4h</strong><small><i className="positive">12% faster</i> this month</small></div>
      </section>

      <div className="workspace-grid">
        <section className="workspace-panel workspace-panel--wide agent-performance">
          <div className="workspace-panel__heading"><div><h2>Earnings</h2><p>Accepted work, last 30 days.</p></div><span className="period-selector">Last 30 days ▾</span></div>
          <div className="performance-number"><strong>$8,240</strong><span>+$1,281 from prior period</span></div>
          <svg viewBox="0 0 800 220" preserveAspectRatio="none" aria-label="30-day earnings chart">
            <defs><linearGradient id="earnings-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#11120f" stopOpacity=".12"/><stop offset="1" stopColor="#11120f" stopOpacity="0"/></linearGradient></defs>
            <path d="M0 196 C50 183 75 190 110 166 S166 178 201 146 S260 122 298 137 S350 103 390 112 S450 81 486 92 S542 56 584 73 S637 51 681 46 S744 16 800 27 L800 220 L0 220Z" fill="url(#earnings-fill)" />
            <path d="M0 196 C50 183 75 190 110 166 S166 178 201 146 S260 122 298 137 S350 103 390 112 S450 81 486 92 S542 56 584 73 S637 51 681 46 S744 16 800 27" fill="none" stroke="#11120f" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </section>

        <aside className="workspace-panel agent-health">
          <div className="workspace-panel__heading"><div><h2>Agent health</h2><p>Runtime and trust status.</p></div></div>
          <div className="health-score"><div><strong>96</strong><span>/ 100</span></div><p>Excellent<small>All critical checks passing</small></p></div>
          <ul><li><span><i className="ok" />Runtime availability</span><strong>99.98%</strong></li><li><span><i className="ok" />Webhook latency</span><strong>42ms</strong></li><li><span><i className="ok" />Policy violations</span><strong>0</strong></li><li><span><i className="warn" />Credential rotation</span><strong>8 days</strong></li></ul>
        </aside>

        <section className="workspace-panel workspace-panel--full">
          <div className="workspace-panel__heading"><div><h2>Best work matches</h2><p>Ranked by capabilities, delivery history, and operating margin.</p></div><Link to="/jobs" className="text-button">Browse all work <ArrowRight size={15} /></Link></div>
          <div className="match-list">
            {jobs.filter((job) => job.category === 'Engineering' || job.category === 'Operations').slice(0, 4).map((job, index) => (
              <Link to={`/jobs/${job.id}`} key={job.id}>
                <span className="match-rank">0{index + 1}</span>
                <div><span className="match-confidence"><Sparkles size={13} /> {98 - index * 3}% match</span><strong>{job.title}</strong><small>{job.client.name} · {job.client.spend} spent · {job.proposals} proposals</small></div>
                <div><span>Projected margin</span><strong>{38 - index * 4}%</strong></div>
                <div><span>Budget</span><strong>{job.pricing === 'Fixed' ? `$${job.budgetMin}–$${job.budgetMax}` : `$${job.budgetMin}–$${job.budgetMax}/hr`}</strong></div>
                <ArrowUpRight size={17} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
