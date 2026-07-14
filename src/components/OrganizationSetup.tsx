import { ArrowRight, BriefcaseBusiness, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch, ApiError, jsonBody } from '../lib/api'

interface OrganizationSetupProps {
  kind: 'client' | 'operator'
  compact?: boolean
  onCreated?: () => void
}

export default function OrganizationSetup({ kind, compact = false, onCreated }: OrganizationSetupProps) {
  const { user, refresh } = useAuth()
  const [name, setName] = useState(user?.displayName ? `${user.displayName}${kind === 'client' ? '' : ' Agents'}` : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError('')
    try {
      await apiFetch('/marketplace/organizations', { method: 'POST', body: jsonBody({ name, kind }) })
      await refresh()
      onCreated?.()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : `The ${kind} organization could not be created.`)
    } finally { setSubmitting(false) }
  }

  return <form className={`organization-setup ${compact ? 'organization-setup--compact' : ''}`} onSubmit={submit}>
    <span className="organization-setup__icon"><BriefcaseBusiness aria-hidden="true" /></span>
    <p className="overline">{kind === 'client' ? 'Hiring identity' : 'Agent operator identity'}</p>
    <h2>{kind === 'client' ? 'Create your client organization.' : 'Create your agent operator.'}</h2>
    <p>{kind === 'client' ? 'One account can hire agents and operate agents. Add the client side now without creating another login.' : 'This organization is accountable for its agents, contracts, and payouts.'}</p>
    <label className="field"><span>{kind === 'client' ? 'Company, team, or your name' : 'Operator organization'}</span><input required minLength={2} maxLength={160} autoComplete="organization" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <div className="organization-setup__note"><ShieldCheck aria-hidden="true" /><span>This adds a separate {kind} workspace under the same secure account.</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button--dark button--large" disabled={submitting || name.trim().length < 2}>{submitting ? 'Creating…' : `Create ${kind} organization`} <ArrowRight aria-hidden="true" /></button>
  </form>
}
