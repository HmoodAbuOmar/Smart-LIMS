import { useState } from 'react'
import { useAuth } from '../../lib/auth/AuthContext'
import { Link, useRouter } from '../../lib/router/RouterContext'
import { ROLE_LABELS } from '../../lib/constants/roles'
import { Button } from '../ui/Button'
import { NAV_BY_ROLE } from './navConfig'

export function AppShell({ children }) {
  const { user, logout } = useAuth()
  const { pathname } = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = NAV_BY_ROLE[user?.role] ?? []

  return (
    <div className={`sl-app-shell${sidebarOpen ? ' sl-app-shell--sidebar-open' : ''}`}>
      <aside className="sl-sidebar" aria-label="Main navigation">
        <div className="sl-sidebar__brand">Smart-LIMS</div>
        <nav className="sl-sidebar__nav">
          {navItems.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(`${item.to}/`)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`sl-sidebar__link${active ? ' sl-sidebar__link--active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </Link>
            )
          })}
          <Link
            to="/app/profile"
            className={`sl-sidebar__link${pathname === '/app/profile' ? ' sl-sidebar__link--active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            Profile
          </Link>
        </nav>
        <div className="sl-sidebar__footer">
          {user?.fullName}
          <br />
          {ROLE_LABELS[user?.role] ?? user?.role}
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
            <Link to="/app/profile">{user?.email}</Link>
            <Button variant="secondary" size="sm" onClick={logout}>
              Log out
            </Button>
          </div>
        </header>
        <div className="sl-page">{children}</div>
      </div>
    </div>
  )
}
