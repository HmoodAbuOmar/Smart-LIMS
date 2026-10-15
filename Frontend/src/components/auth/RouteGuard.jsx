import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { dashboardPathForRole, roleFromAppPath } from '../../lib/constants/roles'
import { AppShell } from '../layout/AppShell'
import { Button } from '../ui/Button'

export function GuestOnlyRoute({ children }) {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated && user) {
    return <Navigate to={dashboardPathForRole(user.role)} replace />
  }
  return children
}

export function ProtectedAppRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const pathRole = roleFromAppPath(location.pathname)
  if (pathRole && pathRole !== user.role) {
    return (
      <AppShell>
        <h1>Forbidden</h1>
        <p>You do not have access to this area.</p>
        <Button variant="primary" onClick={() => navigate(dashboardPathForRole(user.role))}>
          Go to my dashboard
        </Button>
      </AppShell>
    )
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />
  }

  return <AppShell>{children}</AppShell>
}
