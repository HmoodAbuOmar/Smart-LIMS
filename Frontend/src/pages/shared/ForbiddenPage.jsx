import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { dashboardPathForRole } from '../../lib/constants/roles'
import { Button } from '../../components/ui/Button'

export function ForbiddenPage() {
  const { user } = useAuth()

  return (
    <div className="sl-landing__hero">
      <h1>403 — Forbidden</h1>
      <p>You do not have permission to view this page.</p>
      {user ? (
        <Link to={dashboardPathForRole(user.role)}>
          <Button variant="primary">Go to my dashboard</Button>
        </Link>
      ) : (
        <Link to="/login">
          <Button variant="primary">Sign in</Button>
        </Link>
      )}
    </div>
  )
}
