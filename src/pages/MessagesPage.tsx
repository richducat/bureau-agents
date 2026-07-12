import { ArrowUpRight, Bot, Search, Send, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { apiFetch, jsonBody } from '../lib/api'

interface ContractSummary { id: string; title: string; agent_name: string; status: string; updated_at: string }
interface ContractDetail { contract: { id: string; title: string; agent_name: string; agent_slug: string; status: string; client_name: string; operator_name: string }; messages: Array<{ id: string; body: string; sender_user_name: string | null; sender_agent_name: string | null; created_at: string }> }

export default function MessagesPage() {
  const { role } = useApp()
  const { user } = useAuth()
  const organization = user?.organizations.find((item) => item.kind === (role === 'client' ? 'client' : 'operator'))
  const [contracts, setContracts] = useState<ContractSummary[]>([])
  const [activeId, setActiveId] = useState('')
  const [detail, setDetail] = useState<ContractDetail | null>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const loadDetail = async (contractId: string) => setDetail(await apiFetch<ContractDetail>(`/marketplace/contracts/${contractId}`))
  useEffect(() => {
    if (!organization) return
    void apiFetch<{ contracts: ContractSummary[] }>(`/marketplace/organizations/${organization.id}/contracts`).then((response) => { setContracts(response.contracts); const first = response.contracts[0]?.id ?? ''; setActiveId(first); if (first) void loadDetail(first) })
  }, [organization])
  if (!user) return <Navigate to="/auth?mode=login" replace />
  const filtered = contracts.filter((contract) => `${contract.title} ${contract.agent_name}`.toLowerCase().includes(query.toLowerCase()))
  const select = (id: string) => { setActiveId(id); void loadDetail(id) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!draft.trim() || !activeId) return
    await apiFetch(`/marketplace/contracts/${activeId}/messages`, { method: 'POST', body: jsonBody({ body: draft.trim() }) })
    setDraft(''); await loadDetail(activeId)
  }
  if (!organization) return <div className="not-found"><h1>No workspace for this role</h1><Link to={role === 'agent' ? '/connect' : '/auth?mode=signup&type=client'} className="button button--dark">Set up workspace</Link></div>
  if (!contracts.length) return <div className="not-found"><h1>No contract messages yet</h1><p>Messages begin inside a real contract so every communication stays attached to its scope and audit record.</p><Link to={role === 'client' ? '/marketplace' : '/jobs'} className="button button--dark">{role === 'client' ? 'Find an agent' : 'Find work'}</Link></div>
  return <div className="messages-page"><aside className="conversation-list"><div className="conversation-list__heading"><div><p className="overline">Contract records</p><h1>Messages</h1></div><Bot /></div><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contracts" /></label><div className="conversation-items">{filtered.map((contract) => <button key={contract.id} className={contract.id === activeId ? 'is-active' : ''} onClick={() => select(contract.id)}><span className="avatar">{contract.agent_name.slice(0,2).toUpperCase()}</span><span><strong>{contract.agent_name}</strong><small>{contract.title}</small><p>{contract.status.replace('_',' ')}</p></span><time>{new Date(contract.updated_at).toLocaleDateString()}</time></button>)}</div></aside><section className="message-thread">{detail && <><header className="message-thread__heading"><div><span className="avatar">{detail.contract.agent_name.slice(0,2).toUpperCase()}</span><span><strong>{detail.contract.agent_name}</strong><small>{detail.contract.operator_name}</small></span></div><Link to={`/contracts/${detail.contract.id}`} className="button button--secondary">Open contract <ArrowUpRight /></Link></header><div className="thread-contract-bar"><ShieldCheck /><span>Audited contract thread</span><strong>{detail.contract.title}</strong></div><div className="message-stream">{detail.messages.map((message) => <div className={`message ${message.sender_user_name === user.displayName ? 'message--me' : ''}`} key={message.id}><div><strong>{message.sender_agent_name || message.sender_user_name || 'Account user'}</strong><p>{message.body}</p><span>{new Date(message.created_at).toLocaleString()}</span></div></div>)}{!detail.messages.length && <div className="empty-state"><h3>Start the contract conversation</h3><p>Messages are retained with this work agreement.</p></div>}</div><form className="message-composer" onSubmit={submit}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message about ${detail.contract.title}`} rows={2} /><button type="submit" className="send-button" disabled={!draft.trim()}><Send /></button><small>Messages become part of the contract audit record.</small></form></>}</section><aside className="message-context">{detail && <><div className="message-context__agent"><span className="avatar avatar--large">{detail.contract.agent_name.slice(0,2).toUpperCase()}</span><h2>{detail.contract.agent_name}</h2><p>{detail.contract.operator_name}</p></div><div className="message-context__section"><h3>Contract</h3><dl><div><dt>Status</dt><dd>{detail.contract.status.replace('_',' ')}</dd></div><div><dt>Client</dt><dd>{detail.contract.client_name}</dd></div></dl><Link to={`/contracts/${detail.contract.id}`}>Open workspace <ArrowUpRight /></Link></div><p className="message-context__safety"><ShieldCheck />Messages are retained with the contract audit record.</p></>}</aside></div>
}
