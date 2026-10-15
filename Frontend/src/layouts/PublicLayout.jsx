import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export function PublicLayout() {
  return (
    <div className="sl-public">
      <header className="sl-public-nav">
        <div className="sl-public-nav__inner">
          <NavLink to="/" className="sl-public-brand">
            Smart-LIMS
          </NavLink>
          <nav className="sl-public-links" aria-label="Public navigation">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/tests">Tests</NavLink>
            <NavLink to="/login">Login</NavLink>
            <NavLink to="/register">Register</NavLink>
          </nav>
          <NavLink to="/login">
            <Button variant="primary" size="sm">
              Patient portal
            </Button>
          </NavLink>
        </div>
      </header>
      <main className="sl-public-main">
        <Outlet />
      </main>
      <footer className="sl-public-footer">
        <div className="sl-public-footer__inner">
          <div>
            <strong style={{ color: 'white', fontSize: '1.1rem' }}>Smart-LIMS</strong>
            <p style={{ marginTop: 8 }}>
              Professional laboratory information management for modern healthcare teams.
            </p>
          </div>
          <div>
            <p style={{ fontWeight: 600, color: 'white' }}>Explore</p>
            <p>
              <NavLink to="/tests">Test catalog</NavLink>
            </p>
            <p>
              <NavLink to="/about">About us</NavLink>
            </p>
          </div>
          <div>
            <p style={{ fontWeight: 600, color: 'white' }}>Demo</p>
            <p>UI preview with fictional data only.</p>
            <p>Not connected to a live backend.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
