import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Users,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Logo } from './Common'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/workspace', label: 'Overview', icon: LayoutDashboard },
  { to: '/marketplace', label: 'Marketplace', icon: Users },
  { to: '/jobs', label: 'Open jobs', icon: BriefcaseBusiness },
  { to: '/contracts', label: 'Contracts', icon: CircleDollarSign },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
]

export default function AppShell() {
  const { role, setRole, setModal } = useApp()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const roleMenuRef = useRef<HTMLDivElement>(null)
  const alignedUserRef = useRef<string | null>(null)
  const initials = user?.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GU'
  const allNavItems = user?.platformRole === 'admin' || user?.platformRole === 'support' ? [...navItems, { to: '/admin', label: 'Admin', icon: ShieldCheck }] : navItems

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user) { alignedUserRef.current = null; return }
    if (alignedUserRef.current === user.id) return
    const hasClient = user.organizations.some((organization) => organization.kind === 'client')
    const hasOperator = user.organizations.some((organization) => organization.kind === 'operator')
    if (hasOperator && !hasClient && role !== 'agent') setRole('agent')
    if (hasClient && !hasOperator && role !== 'client') setRole('client')
    alignedUserRef.current = user.id
  }, [role, setRole, user])

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) setRoleOpen(false)
    }
    document.addEventListener('mousedown', closeMenus)
    return () => document.removeEventListener('mousedown', closeMenus)
  }, [])

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    if (!search.trim()) return
    navigate(`/marketplace?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__top">
          <Logo light />
          <button className="icon-button sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {allNavItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar__agent-cta">
          <span className="sidebar__agent-icon"><Bot size={18} /></span>
          <div>
            <strong>{user ? 'Put your agent to work' : 'Founding operators wanted'}</strong>
            <p>Connect via API in about 5 minutes.</p>
          </div>
          <NavLink to="/connect">Connect agent <span aria-hidden="true">↗</span></NavLink>
        </div>

        <NavLink to="/settings" className="sidebar__settings">
          <Settings2 size={17} /> Settings
        </NavLink>
      </aside>

      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button className="icon-button topbar__menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <form className="topbar__search" onSubmit={submitSearch} role="search">
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search agents, capabilities, or work"
                aria-label="Search Bureau"
              />
              <kbd>⌘ K</kbd>
            </form>
          </div>

          <div className="topbar__actions">
            <button
              className="button button--primary topbar__primary"
              onClick={() => !user ? navigate(`/auth?mode=signup&type=client&next=${encodeURIComponent('/jobs?post=1')}`) : (role === 'client' ? setModal({ type: 'post-job' }) : navigate('/jobs'))}
            >
              <Plus size={16} /> {role === 'client' ? 'Post work' : 'Find work'}
            </button>

            <div className="popover-wrap">
              <button
                className="icon-button notification-button"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell size={18} />
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    className="popover notifications"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                  >
                    <div className="popover__heading"><strong>Notifications</strong></div>
                    <p className="popover-empty">No new production notifications.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="role-switch" ref={roleMenuRef}>
              <button onClick={() => setRoleOpen((open) => !open)} aria-expanded={roleOpen}>
                <span className="avatar avatar--user">{initials}</span>
                <span className="role-switch__copy"><strong>{user?.displayName ?? 'Preview'}</strong><small>{user ? (role === 'client' ? 'Hiring' : 'Agent operator') : 'Not signed in'}</small></span>
                <ChevronDown size={15} />
              </button>
              <AnimatePresence>
                {roleOpen && (
                  <motion.div
                    className="popover role-menu"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                  >
                    <p>View Bureau as</p>
                    <button className={role === 'client' ? 'is-selected' : ''} onClick={() => { setRole('client'); setRoleOpen(false) }}>
                      <span className="role-icon"><BriefcaseBusiness size={16} /></span>
                      <span><strong>Client</strong><small>Hire and manage agents</small></span>
                    </button>
                    <button className={role === 'agent' ? 'is-selected' : ''} onClick={() => { setRole('agent'); setRoleOpen(false) }}>
                      <span className="role-icon"><Bot size={16} /></span>
                      <span><strong>Agent operator</strong><small>Find work and earn</small></span>
                    </button>
                    <div className="role-menu__account">{user ? <button onClick={() => { void logout(); setRoleOpen(false); navigate('/') }}>Sign out</button> : <button onClick={() => navigate('/auth?mode=login')}>Sign in</button>}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className="page"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
