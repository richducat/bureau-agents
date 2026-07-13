import { Bell, Bot, Copy, CreditCard, KeyRound, LockKeyhole, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError, apiBase, apiFetch, jsonBody } from '../lib/api'

type Section = 'Profile' | 'Security' | 'Notifications' | 'AI buyer'
interface ClientApiKey { id: string; name: string; key_prefix: string; scopes: string[]; last_used_at: string | null; created_at: string }

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('Profile')
  const { user } = useAuth()
  const client = user?.organizations.find((organization) => organization.kind === 'client')
  const [keys, setKeys] = useState<ClientApiKey[]>([])
  const [newSecret, setNewSecret] = useState('')
  const [keyName, setKeyName] = useState('Primary buyer agent')
  const [keyError, setKeyError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (section !== 'AI buyer' || !client) return
    void apiFetch<{ keys: ClientApiKey[] }>(`/marketplace/organizations/${client.id}/client-api-keys`)
      .then((response) => setKeys(response.keys))
      .catch(() => setKeyError('Client agent keys are temporarily unavailable.'))
  }, [section, client])

  if (!user) return <Navigate to="/auth?mode=login" replace />
  const items: Array<{ label: Section; icon: typeof UserRound }> = [
    { label: 'Profile', icon: UserRound },
    { label: 'Security', icon: LockKeyhole },
    { label: 'Notifications', icon: Bell },
    ...(client ? [{ label: 'AI buyer' as const, icon: Bot }] : []),
  ]
  const initials = user.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  const createClientKey = async () => {
    if (!client || creating) return
    setCreating(true); setKeyError(''); setNewSecret('')
    try {
      const response = await apiFetch<{ apiKey: { id: string; prefix: string; secret: string; scopes: string[] } }>(`/marketplace/organizations/${client.id}/client-api-keys`, {
        method: 'POST',
        body: jsonBody({ name: keyName, scopes: ['agents:read', 'tasks:write', 'tasks:read', 'tasks:approve', 'contracts:read'] }),
      })
      setNewSecret(response.apiKey.secret)
      const listed = await apiFetch<{ keys: ClientApiKey[] }>(`/marketplace/organizations/${client.id}/client-api-keys`)
      setKeys(listed.keys)
    } catch (caught) {
      setKeyError(caught instanceof ApiError ? caught.message : 'Could not create the client agent key.')
    } finally { setCreating(false) }
  }

  const revokeClientKey = async (keyId: string) => {
    if (!client) return
    await apiFetch(`/marketplace/organizations/${client.id}/client-api-keys/${keyId}`, { method: 'DELETE' })
    setKeys((current) => current.filter((key) => key.id !== keyId))
  }

  return <div className="settings-page">
    <header className="page-heading"><div><p className="overline">Workspace controls</p><h1>Settings</h1><p>Manage your identity, security, payment protection, and agent integrations.</p></div></header>
    <div className="settings-layout">
      <aside>
        {items.map((item) => { const Icon = item.icon; return <button className={section === item.label ? 'is-active' : ''} key={item.label} onClick={() => setSection(item.label)}><Icon />{item.label}</button> })}
        <Link to="/settings/billing"><CreditCard />Billing & payouts</Link>
        <Link to="/connect"><KeyRound />Agent operator API</Link>
      </aside>
      <main>
        <div className="settings-section-heading"><h2>{section}</h2><p>{section === 'Profile' ? 'Verified account and organization information loaded from the production session.' : section === 'Security' ? 'How Bureau protects this account.' : section === 'Notifications' ? 'Product and contract notification controls.' : 'Let an AI assistant request, match, and approve Bureau work for this client account.'}</p></div>
        {section === 'Profile' && <div className="settings-form"><div className="settings-avatar"><span>{initials}</span></div><label className="field"><span>Full name</span><input value={user.displayName} readOnly /></label><label className="field"><span>Email</span><input value={user.email} readOnly /></label><label className="field"><span>Email status</span><input value={user.emailVerified ? 'Verified' : 'Verification required'} readOnly /></label><label className="field"><span>Organizations</span><input value={user.organizations.map((organization) => organization.name).join(', ') || 'None'} readOnly /></label></div>}
        {section === 'Security' && <div className="settings-security"><ShieldCheck /><h3>Secure session active</h3><ul><li>HTTP-only session cookie; no bearer token in browser storage</li><li>CSRF token and trusted-origin checks on every browser state change</li><li>Adaptive password hashing and rate-limited authentication</li><li>Password reset revokes all active sessions</li><li>Human and agent runtime keys are separate, scoped, hashed, and revocable</li></ul><Link className="button button--dark" to="/forgot-password">Change password securely</Link></div>}
        {section === 'Notifications' && <div className="settings-security"><Bell /><h3>Transactional notifications</h3><p>Bureau sends required account verification, password reset, contract, payment, dispute, and payout notices. Marketing email is not enabled by default.</p></div>}
        {section === 'AI buyer' && client && <div className="client-agent-settings">
          <section className="client-agent-settings__intro"><Bot /><div><h3>Hire through your own agent</h3><p>Your assistant can submit a task, receive the matched Bureau worker and quote, track status, and accept the work plan. Stripe payment still opens as a secure browser approval.</p></div></section>
          <div className="client-agent-endpoint"><span>API base</span><code>{apiBase.replace(/\/api$/, '')}/api/v1/client</code><Link to="/docs/agent-api#client-agents">Read integration guide</Link></div>
          {newSecret && <div className="one-time-secret" role="status"><ShieldCheck /><div><strong>Copy this key now</strong><p>It is shown once and stored only as a hash.</p><code>{newSecret}</code></div><button className="button button--secondary" onClick={() => void navigator.clipboard.writeText(newSecret)}><Copy />Copy</button></div>}
          <div className="client-agent-key-create"><label className="field"><span>Key name</span><input value={keyName} onChange={(event) => setKeyName(event.target.value)} /></label><button className="button button--dark" disabled={creating || keyName.trim().length < 2} onClick={() => void createClientKey()}>{creating ? 'Creating…' : 'Create client agent key'}</button></div>
          {keyError && <p className="form-error">{keyError}</p>}
          <div className="client-agent-key-list"><header><h3>Active keys</h3><span>{keys.length}</span></header>{keys.length === 0 ? <p>No client agent keys yet.</p> : keys.map((key) => <div key={key.id}><span><strong>{key.name}</strong><small>{key.key_prefix}… · {key.last_used_at ? `last used ${new Date(key.last_used_at).toLocaleString()}` : 'never used'}</small></span><button aria-label={`Revoke ${key.name}`} onClick={() => void revokeClientKey(key.id)}><Trash2 /></button></div>)}</div>
        </div>}
      </main>
    </div>
  </div>
}
