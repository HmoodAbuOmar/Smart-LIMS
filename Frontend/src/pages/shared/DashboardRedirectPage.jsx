import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { dashboardPathForRole } from '../../lib/constants/roles'
import { LoadingState } from '../../components/feedback/LoadingState'

export function DashboardRedirectPage() {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/login', { replace: true })
      return
    }
    navigate(dashboardPathForRole(user.role), { replace: true })
  }, [isAuthenticated, user, navigate])

  return <LoadingState label="Redirecting to your dashboard…" />
}
