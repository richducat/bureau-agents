import { ArrowUpRight, Bot, CheckCheck, MoreHorizontal, Paperclip, Search, Send, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgentMark, StatusDot } from '../components/Common'
import { agents } from '../data'
import { useApp } from '../context/AppContext'

export default function MessagesPage() {
  const { conversations, sendMessage, showToast } = useApp()
  const [activeId, setActiveId] = useState(conversations[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const messagesEnd = useRef<HTMLDivElement>(null)
  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0]
  const agent = active ? agents.find((item) => item.id === active.agentId)! : null
  const filtered = conversations.filter((conversation) => {
    const itemAgent = agents.find((item) => item.id === conversation.agentId)
    return [conversation.subject, itemAgent?.name].join(' ').toLowerCase().includes(query.toLowerCase())
  })

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages.length])

  if (!active || !agent) return <div className="not-found"><h1>No messages yet</h1><Link to="/marketplace" className="button button--dark">Find an agent</Link></div>

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    sendMessage(active.id, draft.trim())
    setDraft('')
  }

  return (
    <div className="messages-page">
      <aside className="conversation-list">
        <div className="conversation-list__heading"><div><p className="overline">Secure workspace</p><h1>Messages</h1></div><button className="icon-button" onClick={() => showToast('New message composer opened')}><Bot size={18} /></button></div>
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label>
        <div className="conversation-items">
          {filtered.map((conversation) => {
            const itemAgent = agents.find((item) => item.id === conversation.agentId)!
            const lastMessage = conversation.messages.at(-1)
            return (
              <button key={conversation.id} className={conversation.id === active.id ? 'is-active' : ''} onClick={() => setActiveId(conversation.id)}>
                <AgentMark agent={itemAgent} />
                <span><strong>{itemAgent.name}</strong><small>{conversation.subject}</small><p>{lastMessage?.body}</p></span>
                <time>{lastMessage?.time.split(',')[0]}</time>
                {conversation.unread > 0 && <i>{conversation.unread}</i>}
              </button>
            )
          })}
        </div>
      </aside>

      <section className="message-thread">
        <header className="message-thread__heading">
          <div><AgentMark agent={agent} /><span><strong>{agent.name}</strong><small><StatusDot online={agent.online} /></small></span></div>
          <div><Link to={`/agents/${agent.id}`} className="button button--secondary">View profile <ArrowUpRight size={15} /></Link><button className="icon-button" onClick={() => showToast('Conversation actions opened')}><MoreHorizontal size={18} /></button></div>
        </header>
        <div className="thread-contract-bar"><ShieldCheck size={15} /><span>Protected contract workspace</span><strong>{active.subject}</strong><Link to="/contracts">Open contract <ArrowUpRight size={13} /></Link></div>
        <div className="message-stream">
          <div className="message-date"><span>Contract started</span></div>
          {active.messages.map((message) => (
            message.sender === 'system' ? (
              <div className="system-message" key={message.id}><ShieldCheck size={14} />{message.body}<time>{message.time}</time></div>
            ) : (
              <div className={`message ${message.sender === 'me' ? 'message--me' : ''}`} key={message.id}>
                {message.sender === 'them' && <AgentMark agent={agent} size="small" />}
                <div><p>{message.body}</p><span>{message.time}{message.sender === 'me' && <CheckCheck size={13} />}</span></div>
              </div>
            )
          ))}
          <div ref={messagesEnd} />
        </div>
        <form className="message-composer" onSubmit={submit}>
          <button type="button" className="icon-button" onClick={() => showToast('File picker opened in demo mode')} aria-label="Attach file"><Paperclip size={18} /></button>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${agent.name}`} rows={1} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
          <button type="submit" className="send-button" disabled={!draft.trim()} aria-label="Send message"><Send size={17} /></button>
          <small>Enter to send · Shift + Enter for a new line</small>
        </form>
      </section>

      <aside className="message-context">
        <div className="message-context__agent"><AgentMark agent={agent} size="large" /><h2>{agent.name}</h2><p>{agent.specialty}</p><StatusDot online={agent.online} /></div>
        <div className="message-context__section"><h3>Contract</h3><dl><div><dt>Status</dt><dd><i className="contract-status contract-status--running">Running</i></dd></div><div><dt>Value</dt><dd>$2,400</dd></div><div><dt>Next milestone</dt><dd>Evidence review</dd></div><div><dt>Due</dt><dd>Jul 18</dd></div></dl><Link to="/contracts/ct-1048">Open workspace <ArrowUpRight size={13} /></Link></div>
        <div className="message-context__section"><h3>Shared files</h3><button><Paperclip size={14} /><span><strong>source-strategy.pdf</strong><small>2.1 MB</small></span></button><button><Paperclip size={14} /><span><strong>evidence-pack.csv</strong><small>488 KB</small></span></button></div>
        <p className="message-context__safety"><ShieldCheck size={14} /> Messages and files are retained with the contract audit record.</p>
      </aside>
    </div>
  )
}
