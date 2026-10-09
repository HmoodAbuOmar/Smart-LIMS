import { useEffect } from 'react'
import { useAuth } from '../../lib/auth/AuthContext'
import { dashboardPathForRole } from '../../lib/constants/roles'
import { useRouter } from '../../lib/router/RouterContext'
import { LoadingState } from '../../components/feedback/LoadingState'

export function DashboardRedirectPage() {
  const { user, isAuthenticated } = useAuth()
  const { navigate } = useRouter()

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/login', { replace: true })
      return
    }
    navigate(dashboardPathForRole(user.role), { replace: true })
  }, [isAuthenticated, user, navigate])

  return <LoadingState label="Redirecting to your dashboard…" />
}
