import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/feedback/LoadingState'

export function ConfirmEmailPage() {
  const { confirmEmail } = useAuth()
  const token = new URLSearchParams(window.location.search).get('token')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const result = await confirmEmail({ token })
      if (active) {
        setMessage(result.message)
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [confirmEmail, token])

  return (
    <AuthLayout
      title="Confirm email"
      subtitle="Simulated confirmation — verify `/api/auth/confirm-email` before production."
    >
      {loading ? <LoadingState label="Confirming…" /> : null}
      {!loading && message ? (
        <div className="sl-alert sl-alert--info">{message}</div>
      ) : null}
      <Link to="/login">
        <Button variant="primary">Continue to sign in</Button>
      </Link>
    </AuthLayout>
  )
}
