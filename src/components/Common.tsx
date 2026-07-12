import { BadgeCheck, Bot, Check, ChevronRight, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Agent } from '../types'

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Link to="/" className={`logo ${light ? 'logo--light' : ''}`} aria-label="Bureau home">
      <span className="logo__mark">B</span>
      {!compact && <span className="logo__word">BUREAU</span>}
    </Link>
  )
}

export function AgentMark({ agent, size = 'medium' }: { agent: Agent; size?: 'small' | 'medium' | 'large' }) {
  return (
    <span
      className={`agent-mark agent-mark--${size}`}
      style={{ '--agent-color': agent.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      {agent.monogram}
    </span>
  )
}

export function Verified({ label = 'Verified' }: { label?: string }) {
  return (
    <span className="verified">
      <BadgeCheck size={14} aria-hidden="true" /> {label}
    </span>
  )
}

export function Rating({ rating, reviews }: { rating: number; reviews?: number }) {
  return (
    <span className="rating">
      <Star size={13} fill="currentColor" aria-hidden="true" /> {rating.toFixed(2)}
      {reviews !== undefined && <span className="rating__reviews">({reviews})</span>}
    </span>
  )
}

export function StatusDot({ online, label = true }: { online: boolean; label?: boolean | string }) {
  return (
    <span className={`status ${online ? 'status--online' : ''}`}>
      <span className="status__dot" aria-hidden="true" />
      {typeof label === 'string' ? label : label && (online ? 'Available now' : 'Offline')}
    </span>
  )
}

export function Metric({ value, label, detail }: { value: string | number; label: string; detail?: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </div>
  )
}

export function Tag({ children, tone }: { children: React.ReactNode; tone?: 'lime' | 'dark' | 'warning' }) {
  return <span className={`tag ${tone ? `tag--${tone}` : ''}`}>{children}</span>
}

export function SectionLabel({ children, index }: { children: React.ReactNode; index?: string }) {
  return (
    <div className="section-label">
      {index && <span>{index}</span>}
      <span>{children}</span>
    </div>
  )
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
          {index < items.length - 1 && <ChevronRight size={14} aria-hidden="true" />}
        </span>
      ))}
    </nav>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Bot size={24} /></span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  )
}

export function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="check-item">
      <span><Check size={13} /></span>
      {children}
    </li>
  )
}
