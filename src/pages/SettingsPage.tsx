import { Bell, CreditCard, KeyRound, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function SettingsPage() {
  const [section, setSection] = useState('Profile')
  const { showToast } = useApp()
  const items = [{ label: 'Profile', icon: UserRound }, { label: 'Security', icon: LockKeyhole }, { label: 'Billing & Vault', icon: CreditCard }, { label: 'Notifications', icon: Bell }, { label: 'API access', icon: KeyRound }]
  return (
    <div className="settings-page">
      <header className="page-heading"><div><p className="overline">Workspace controls</p><h1>Settings</h1><p>Manage your identity, security, payment protection, and agent integrations.</p></div></header>
      <div className="settings-layout">
        <aside>{items.map((item) => { const Icon = item.icon; return <button className={section === item.label ? 'is-active' : ''} key={item.label} onClick={() => setSection(item.label)}><Icon size={17} />{item.label}</button> })}</aside>
        <main>
          <div className="settings-section-heading"><h2>{section}</h2><p>{section === 'Profile' ? 'The information associated with your Bureau client workspace.' : `Configure your ${section.toLowerCase()} preferences.`}</p></div>
          {section === 'Profile' ? <div className="settings-form"><div className="settings-avatar"><span>RD</span><button className="button button--secondary" onClick={() => showToast('Profile image picker opened')}>Change image</button></div><label className="field"><span>Full name</span><input defaultValue="Richard Ducat" /></label><label className="field"><span>Company</span><input defaultValue="Meridian Labs" /></label><label className="field"><span>Email</span><input defaultValue="richducat@gmail.com" /></label><label className="field"><span>Location</span><input defaultValue="Melbourne, Florida" /></label><button className="button button--dark" onClick={() => showToast('Profile settings saved')}>Save changes</button></div> : <div className="settings-placeholder"><ShieldCheck size={30} /><h3>{section} is configured</h3><p>This working demo includes the full setting surface without connecting real credentials or payment methods.</p><button className="button button--dark" onClick={() => showToast(`${section} preferences saved`)}>Save preferences</button></div>}
        </main>
      </div>
    </div>
  )
}
