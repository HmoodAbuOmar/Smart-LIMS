import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Button } from '../../components/ui/Button'

export function ResetPasswordPage() {
  const { resetPassword } = useAuth()
  const { pathname } = useLocation()
  const token = new URLSearchParams(window.location.search).get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setError(null)
    const result = await resetPassword({ token, password })
    setMessage(result.message)
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle={`Mock reset flow. Token from URL: ${token ? 'present' : 'missing'} (${pathname}).`}
    >
      {error ? <div className="sl-form-error-summary">{error}</div> : null}
      {message ? <div className="sl-alert sl-alert--info">{message}</div> : null}
      <form onSubmit={onSubmit}>
        <FormField id="password" label="New password" required>
          <TextInput
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FormField>
        <FormField id="confirm" label="Confirm password" required>
          <TextInput
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </FormField>
        <Button type="submit" variant="primary" block>
          Update password
        </Button>
      </form>
      <p style={{ marginTop: 16, fontSize: 'var(--sl-text-sm)' }}>
        <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
