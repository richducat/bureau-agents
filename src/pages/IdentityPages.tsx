import { CheckCircle2, KeyRound, MailCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Common'
import { apiFetch, ApiError, jsonBody } from '../lib/api'
import { safeInternalPath } from '../lib/navigation'

function tokenFromHash() {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
}

export function VerifyEmailPage() {
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('Verifying your secure link…')
  const nextPath = (() => {
    const stored = window.localStorage.getItem('bureau-post-auth-next')
    return safeInternalPath(stored)
  })()
  useEffect(() => {
    const token = tokenFromHash()
    if (!token) { setState('error'); setMessage('This verification link is missing its token.'); return }
    void apiFetch('/auth/verify-email', { method: 'POST', body: jsonBody({ token }) })
      .then(() => { setState('done'); setMessage('Your email is verified. Bureau is ready.'); window.localStorage.removeItem('bureau-post-auth-next') })
      .catch((error) => { setState('error'); setMessage(error instanceof ApiError ? error.message : 'Verification failed.') })
  }, [])
  return <IdentityFrame icon={state === 'done' ? <CheckCircle2 /> : <MailCheck />} title={state === 'done' ? 'Email verified' : state === 'error' ? 'Link unavailable' : 'Verifying email'} message={message}><Link to={state === 'done' ? nextPath : '/auth?mode=login'} className="button button--dark">{state === 'done' ? 'Continue' : 'Return to sign in'}</Link></IdentityFrame>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await apiFetch('/auth/forgot-password', { method: 'POST', body: jsonBody({ email }) })
    setSent(true)
  }
  return <IdentityFrame icon={<MailCheck />} title={sent ? 'Check your email' : 'Reset your password'} message={sent ? 'If that address has a Bureau account, a secure reset link is on its way.' : 'Enter the email attached to your Bureau account.'}>{!sent ? <form className="identity-form" onSubmit={submit}><label className="field"><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="button button--dark">Send reset link</button></form> : <Link className="button button--secondary" to="/auth?mode=login">Return to sign in</Link>}</IdentityFrame>
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: jsonBody({ token: tokenFromHash(), newPassword: password }) })
      navigate('/auth?mode=login&reset=success')
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Reset failed.') }
  }
  return <IdentityFrame icon={<KeyRound />} title="Choose a new password" message="Use at least 12 characters with uppercase, lowercase, and a number."><form className="identity-form" onSubmit={submit}><label className="field"><span>New password</span><input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<button className="button button--dark">Update password</button></form></IdentityFrame>
}

function IdentityFrame({ icon, title, message, children }: { icon: React.ReactNode; title: string; message: string; children: React.ReactNode }) {
  return <div className="identity-page"><Logo /><main><span className="identity-icon">{icon}</span><h1>{title}</h1><p>{message}</p>{children}</main></div>
}
