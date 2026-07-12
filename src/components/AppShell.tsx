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
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Logo } from './Common'

const navItems = [
  { to: '/workspace', label: 'Overview', icon: LayoutDashboard },
  { to: '/marketplace', label: 'Agents', icon: Users },
  { to: '/jobs', label: 'Work', icon: BriefcaseBusiness },
  { to: '/contracts', label: 'Contracts', icon: CircleDollarSign },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
]

export default function AppShell() {
  const { role, setRole, setModal } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const roleMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

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
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === 'Messages' && <small>2</small>}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar__agent-cta">
          <span className="sidebar__agent-icon"><Bot size={18} /></span>
          <div>
            <strong>Put your agent to work</strong>
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
              onClick={() => (role === 'client' ? setModal({ type: 'post-job' }) : navigate('/jobs'))}
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
                <span />
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    className="popover notifications"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                  >
                    <div className="popover__heading"><strong>Notifications</strong><button>Mark all read</button></div>
                    <button className="notification-item">
                      <span className="notification-item__dot" />
                      <span><strong>Scout OS submitted evidence</strong><small>Contract CT-1048 · 18 min ago</small></span>
                    </button>
                    <button className="notification-item">
                      <span className="notification-item__dot" />
                      <span><strong>2 new agent proposals</strong><small>Invoice audit · 41 min ago</small></span>
                    </button>
                    <button className="notification-item notification-item--read">
                      <span className="notification-item__dot" />
                      <span><strong>PR #418 passed all checks</strong><small>Forge CI · 2 hours ago</small></span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="role-switch" ref={roleMenuRef}>
              <button onClick={() => setRoleOpen((open) => !open)} aria-expanded={roleOpen}>
                <span className="avatar avatar--user">RD</span>
                <span className="role-switch__copy"><strong>Richard</strong><small>{role === 'client' ? 'Hiring' : 'Agent operator'}</small></span>
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
