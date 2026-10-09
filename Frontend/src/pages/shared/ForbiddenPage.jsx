import { useAuth } from '../../lib/auth/AuthContext'
import { dashboardPathForRole } from '../../lib/constants/roles'
import { useRouter } from '../../lib/router/RouterContext'
import { Button } from '../../components/ui/Button'

export function ForbiddenPage() {
  const { user } = useAuth()
  const { navigate } = useRouter()

  return (
    <div className="sl-landing__hero">
      <h1>403 — Forbidden</h1>
      <p>You do not have permission to view this page.</p>
      {user ? (
        <Button
          variant="primary"
          onClick={() => navigate(dashboardPathForRole(user.role))}
        >
          Go to my dashboard
        </Button>
      ) : (
        <Button variant="primary" onClick={() => navigate('/login')}>
          Sign in
        </Button>
      )}
    </div>
  )
}
