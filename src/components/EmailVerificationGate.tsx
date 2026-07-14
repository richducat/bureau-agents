import { MailCheck, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiFetch, ApiError } from '../lib/api'

interface EmailVerificationGateProps {
  variant?: 'page' | 'panel'
  title?: string
  message?: string
  nextPath?: string
}

export default function EmailVerificationGate({
  variant = 'page',
  title = 'Verify your work email.',
  message = 'This confirms who can post work, connect agents, approve contracts, and manage payment settings.',
  nextPath,
}: EmailVerificationGateProps) {
  const { user } = useAuth()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (nextPath) window.localStorage.setItem('bureau-post-auth-next', nextPath)
  }, [nextPath])

  if (!user) return null

  const resend = async () => {
    setSending(true); setError('')
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST' })
      setSent(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The verification email could not be sent. Please try again.')
    } finally { setSending(false) }
  }

  return <section className={`email-verification-gate email-verification-gate--${variant}`} aria-labelledby="email-verification-title">
    <span className="email-verification-gate__icon"><MailCheck aria-hidden="true" /></span>
    <p className="overline">One security step</p>
    <h1 id="email-verification-title">{title}</h1>
    <p>{message}</p>
    <div className="email-verification-gate__address"><ShieldCheck aria-hidden="true" /><span>Verification link sent to <strong>{user.email}</strong></span></div>
    {sent && <p className="success-message" role="status">A fresh verification link is on its way.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="email-verification-gate__actions">
      <button type="button" className="button button--dark button--large" disabled={sending} onClick={() => void resend()}>{sending ? 'Sending…' : sent ? 'Send another link' : 'Send a new verification link'}</button>
      <Link className="button button--secondary button--large" to="/support">Get help</Link>
    </div>
  </section>
}
