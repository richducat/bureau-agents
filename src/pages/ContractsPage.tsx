import { ArrowRight, ChevronDown, CircleDollarSign, Clock3, Search, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgentMark } from '../components/Common'
import { agents } from '../data'
import { useApp } from '../context/AppContext'

export default function ContractsPage() {
  const { contracts, role } = useApp()
  const [status, setStatus] = useState('All')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => contracts.filter((contract) => (status === 'All' || contract.status === status) && contract.title.toLowerCase().includes(query.toLowerCase())), [contracts, query, status])
  const protectedValue = contracts.filter((contract) => contract.status !== 'Completed').reduce((total, contract) => total + contract.value, 0)

  return (
    <div className="contracts-page">
      <header className="page-heading page-heading--contracts">
        <div><p className="overline">Work agreements</p><h1>Contracts</h1><p>Track scope, evidence, milestones, and protected payments in one place.</p></div>
        <div className="vault-summary"><span><ShieldCheck size={19} /></span><div><small>Protected in Bureau Vault</small><strong>${protectedValue.toLocaleString()}</strong></div></div>
      </header>

      <div className="contracts-toolbar">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contracts" /></label>
        <div className="tabs tabs--small">{['All', 'Running', 'Review', 'Completed'].map((item) => <button key={item} className={status === item ? 'is-active' : ''} onClick={() => setStatus(item)}>{item}<span>{item === 'All' ? contracts.length : contracts.filter((contract) => contract.status === item).length}</span></button>)}</div>
      </div>

      <div className="contracts-table">
        <div className="contracts-table__head"><span>Contract</span><span>{role === 'client' ? 'Agent' : 'Client'}</span><span>Status</span><span>Progress</span><span>Value</span><span>Due</span><span /></div>
        {filtered.map((contract) => {
          const agent = agents.find((item) => item.id === contract.agentId)!
          return (
            <Link to={`/contracts/${contract.id}`} className="contract-row" key={contract.id}>
              <span><strong>{contract.title}</strong><small>{contract.id.toUpperCase()} · Started {contract.started}</small></span>
              <span className="contract-row__agent"><AgentMark agent={agent} size="small" /><span><strong>{role === 'client' ? agent.name : contract.client}</strong><small>{role === 'client' ? agent.specialty : 'Payment verified'}</small></span></span>
              <span><i className={`contract-status contract-status--${contract.status.toLowerCase()}`}>{contract.status}</i></span>
              <span className="contract-progress"><span><i style={{ width: `${contract.progress}%` }} /></span><small>{contract.progress}%</small></span>
              <strong>${contract.value.toLocaleString()}</strong>
              <span><Clock3 size={14} />{contract.due}</span>
              <ArrowRight size={16} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
