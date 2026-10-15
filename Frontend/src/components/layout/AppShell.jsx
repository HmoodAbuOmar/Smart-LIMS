import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { ROLE_LABELS } from '../../lib/constants/roles'
import { Button } from '../ui/Button'
import { MockBanner } from '../feedback/MockBanner'
import { NAV_BY_ROLE } from './navConfig'

export function AppShell({ children }) {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = NAV_BY_ROLE[user?.role] ?? []

  return (
    <div className={`sl-app-shell${sidebarOpen ? ' sl-app-shell--sidebar-open' : ''}`}>
      <aside className="sl-sidebar" aria-label="Main navigation">
        <div className="sl-sidebar__brand">Smart-LIMS</div>
        <nav className="sl-sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sl-sidebar__link${isActive ? ' sl-sidebar__link--active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/app/profile"
            className={({ isActive }) =>
              `sl-sidebar__link${isActive ? ' sl-sidebar__link--active' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            Profile
          </NavLink>
        </nav>
        <div className="sl-sidebar__footer">
          {user?.fullName}
          <br />
          {ROLE_LABELS[user?.role] ?? user?.role}
          <br />
          <span style={{ color: 'var(--sl-warning)' }}>Demo session</span>
        </div>
      </aside>

      <div className="sl-main">
        <header className="sl-topbar">
          <Button
            variant="ghost"
            className="sl-topbar__menu"
            aria-label="Open menu"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            Menu
          </Button>
          <span style={{ fontWeight: 600, color: 'var(--sl-text-heading)' }}>
            Smart-LIMS
          </span>
          <div className="sl-row">
            <NavLink to="/app/profile">{user?.email}</NavLink>
            <Button variant="secondary" size="sm" onClick={logout}>
              Log out
            </Button>
          </div>
        </header>
        <div className="sl-page">
          <MockBanner />
          {children}
        </div>
      </div>
    </div>
  )
}
