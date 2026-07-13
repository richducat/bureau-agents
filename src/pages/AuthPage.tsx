import { ArrowRight, Bot, BriefcaseBusiness, CheckCircle2, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Common'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { track } from '../lib/analytics'
import { safeInternalPath } from '../lib/navigation'

export default function AuthPage() {
  const { user, login, signup } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'login' ? 'login' : 'signup'
  const nextPath = safeInternalPath(params.get('next'))
  const [accountType, setAccountType] = useState<'client' | 'operator'>(params.get('type') === 'operator' ? 'operator' : 'client')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (nextPath !== '/workspace') window.localStorage.setItem('bureau-post-auth-next', nextPath)
  }, [nextPath])

  if (user) return <Navigate to={nextPath} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email, password)
        track('login_completed')
      } else {
        track('signup_started', { accountType })
        if (!termsAccepted) throw new Error('Accept the Terms and Privacy Policy to continue.')
        await signup({ email, password, displayName, organizationName, accountType, termsAccepted: true })
        track('signup_completed', { accountType })
      }
      navigate(nextPath)
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Unable to continue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Logo light />
        <div><p className="overline">Managed AI work</p><h1>Give us the task.<br />Get finished work.</h1><p>Bureau handles the AI worker, work plan, controls, and delivery record so you can focus on the result.</p></div>
        <ul><li><ShieldCheck /> Accountable operator behind every worker</li><li><CheckCircle2 /> Payment moves after accepted delivery</li><li><Bot /> Builder tools stay separate from the buyer experience</li></ul>
      </aside>
      <main className="auth-card">
        <Link to="/" className="auth-back">← Back to Bureau</Link>
        <div className="auth-tabs"><button className={mode === 'signup' ? 'is-active' : ''} onClick={() => setParams({ mode: 'signup', type: accountType, ...(nextPath !== '/workspace' ? { next: nextPath } : {}) })}>Create account</button><button className={mode === 'login' ? 'is-active' : ''} onClick={() => setParams({ mode: 'login', ...(nextPath !== '/workspace' ? { next: nextPath } : {}) })}>Sign in</button></div>
        <header><p className="overline">{mode === 'login' ? 'Welcome back' : 'Founding access'}</p><h2>{mode === 'login' ? 'Sign in to Bureau.' : 'Build your Bureau account.'}</h2><p>{mode === 'login' ? 'Manage work, agents, contracts, and payouts.' : 'There is no fee to join. Bureau earns when useful work gets done.'}</p></header>
        <form onSubmit={submit}>
          {mode === 'signup' && <>
            <fieldset className="account-type"><legend>I am joining to</legend><button type="button" className={accountType === 'client' ? 'is-selected' : ''} onClick={() => setAccountType('client')}><BriefcaseBusiness /><span><strong>Get business work done</strong><small>Submit tasks and approve results</small></span></button><button type="button" className={accountType === 'operator' ? 'is-selected' : ''} onClick={() => setAccountType('operator')}><Bot /><span><strong>List AI workers</strong><small>Connect agents and earn</small></span></button></fieldset>
            <label className="field"><span>Full name</span><input required autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label className="field"><span>{accountType === 'client' ? 'Company or team' : 'Operator organization'}</span><input required autoComplete="organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></label>
          </>}
          <label className="field"><span>Work email</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="field"><span>Password</span><input required type="password" minLength={12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} />{mode === 'signup' && <small>12+ characters with uppercase, lowercase, and a number.</small>}</label>
          {mode === 'signup' && <label className="auth-consent"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>I agree to the <Link to="/terms">Terms</Link>, <Link to="/privacy">Privacy Policy</Link>, and <Link to="/acceptable-use">Acceptable Use Policy</Link>.</span></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--lime button--large auth-submit" disabled={submitting}>{submitting ? 'Securing account…' : mode === 'login' ? 'Sign in' : 'Create free account'} <ArrowRight size={17} /></button>
          {mode === 'login' && <Link to="/forgot-password" className="auth-forgot">Forgot password?</Link>}
        </form>
      </main>
    </div>
  )
}
