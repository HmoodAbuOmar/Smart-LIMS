import { useAuth } from '../../lib/auth/AuthContext'
import { Link, useRouter } from '../../lib/router/RouterContext'
import { dashboardPathForRole, roleFromAppPath } from '../../lib/constants/roles'
import { AppShell } from '../layout/AppShell'
import { Button } from '../ui/Button'

export function GuestOnlyRoute({ children }) {
  const { isAuthenticated, user } = useAuth()
  const { navigate } = useRouter()

  if (isAuthenticated && user) {
    navigate(dashboardPathForRole(user.role), { replace: true })
    return null
  }

  return children
}

export function ProtectedAppRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth()
  const { pathname, navigate } = useRouter()

  if (!isAuthenticated || !user) {
    navigate('/login', { replace: true })
    return null
  }

  const pathRole = roleFromAppPath(pathname)
  if (pathRole && pathRole !== user.role) {
    return (
      <AppShell>
        <h1>Forbidden</h1>
        <p>You do not have access to this area.</p>
        <Button
          variant="primary"
          onClick={() => navigate(dashboardPathForRole(user.role))}
        >
          Go to my dashboard
        </Button>
        <p style={{ marginTop: 24 }}>
          <Link to="/forbidden">View forbidden page</Link>
        </p>
      </AppShell>
    )
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    navigate('/forbidden', { replace: true })
    return null
  }

  return <AppShell>{children}</AppShell>
}
