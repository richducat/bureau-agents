import { ArrowRight, Clock3, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

interface LiveContract { id: string; title: string; status: string; total_work_value_cents: number; agent_name: string; client_org_id: string; operator_org_id: string; milestone_count: number; released_count: number; created_at: string; updated_at: string }

export default function ContractsPage() {
  const { role } = useApp()
  const { user } = useAuth()
  const organization = user?.organizations.find((item) => item.kind === (role === 'client' ? 'client' : 'operator'))
  const [contracts, setContracts] = useState<LiveContract[]>([])
  const [status, setStatus] = useState('All')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!organization) { setLoading(false); return }
    void apiFetch<{ contracts: LiveContract[] }>(`/marketplace/organizations/${organization.id}/contracts`).then((response) => setContracts(response.contracts)).finally(() => setLoading(false))
  }, [organization])
  const filtered = useMemo(() => contracts.filter((contract) => (status === 'All' || contract.status === status) && contract.title.toLowerCase().includes(query.toLowerCase())), [contracts, query, status])
  const activeValue = contracts.filter((contract) => !['completed','cancelled'].includes(contract.status)).reduce((total, contract) => total + Number(contract.total_work_value_cents), 0)
  const statuses = ['All', 'pending_funding', 'active', 'submitted', 'completed', 'disputed']
  if (!user) return <Navigate to="/auth?mode=login" replace />
  return <div className="contracts-page"><header className="page-heading page-heading--contracts"><div><p className="overline">Production work agreements</p><h1>Contracts</h1><p>Scope, milestones, delivery evidence, payment state, and disputes in one ledger.</p></div><div className="vault-summary"><span><ShieldCheck /></span><div><small>Active work value</small><strong>${(activeValue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div></div></header><div className="contracts-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contracts" /></label><div className="tabs tabs--small">{statuses.map((item) => <button key={item} className={status === item ? 'is-active' : ''} onClick={() => setStatus(item)}>{item.replace('_',' ')}<span>{item === 'All' ? contracts.length : contracts.filter((contract) => contract.status === item).length}</span></button>)}</div></div><div className="contracts-table"><div className="contracts-table__head"><span>Contract</span><span>Agent</span><span>Status</span><span>Milestones</span><span>Work value</span><span>Updated</span><span /></div>{filtered.map((contract) => <Link to={`/contracts/${contract.id}`} className="contract-row" key={contract.id}><span><strong>{contract.title}</strong><small>{contract.id.slice(0, 8).toUpperCase()} · Created {new Date(contract.created_at).toLocaleDateString()}</small></span><span className="contract-row__agent"><span className="avatar">{contract.agent_name.slice(0,2).toUpperCase()}</span><span><strong>{contract.agent_name}</strong><small>Production contract party</small></span></span><span><i className={`contract-status contract-status--${contract.status}`}>{contract.status.replace('_',' ')}</i></span><span className="contract-progress"><span><i style={{ width: `${contract.milestone_count ? Math.round(contract.released_count / contract.milestone_count * 100) : 0}%` }} /></span><small>{contract.released_count}/{contract.milestone_count}</small></span><strong>${(contract.total_work_value_cents / 100).toLocaleString()}</strong><span><Clock3 />{new Date(contract.updated_at).toLocaleDateString()}</span><ArrowRight /></Link>)}{!loading && !filtered.length && <div className="empty-state"><h3>No contracts match</h3><p>Contracts appear here only after a real proposal is accepted or a direct contract is created.</p></div>}</div></div>
}
