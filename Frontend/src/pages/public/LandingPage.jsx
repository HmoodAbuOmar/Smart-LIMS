import { Link } from '../../lib/router/RouterContext'
import { Button } from '../../components/ui/Button'

export function LandingPage() {
  return (
    <div className="sl-landing">
      <header className="sl-topbar">
        <span style={{ fontWeight: 700, color: 'var(--sl-primary-600)' }}>
          Smart-LIMS
        </span>
        <div className="sl-row">
          <Link to="/login">
            <Button variant="ghost">Log in</Button>
          </Link>
          <Link to="/register">
            <Button variant="primary">Register</Button>
          </Link>
        </div>
      </header>
      <section className="sl-landing__hero">
        <h1>Modern laboratory workflows for patients and staff</h1>
        <p style={{ maxWidth: 560, color: 'var(--sl-text-muted)' }}>
          Preview the Smart-LIMS frontend: authentication, role dashboards, orders,
          appointments, samples, and results — using mock data until backend integration.
        </p>
        <div className="sl-landing__actions">
          <Link to="/login">
            <Button variant="primary">Sign in</Button>
          </Link>
          <Link to="/register">
            <Button variant="secondary">Create patient account</Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
