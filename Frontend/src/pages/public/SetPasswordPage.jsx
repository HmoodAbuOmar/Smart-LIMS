import { useState } from 'react'
import { Link } from '../../lib/router/RouterContext'
import { useAuth } from '../../lib/auth/AuthContext'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Button } from '../../components/ui/Button'

export function SetPasswordPage() {
  const { setPassword } = useAuth()
  const token = new URLSearchParams(window.location.search).get('token')
  const [password, setPasswordValue] = useState('')
  const [message, setMessage] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    const result = await setPassword({ token, password })
    setMessage(result.message)
  }

  return (
    <AuthLayout
      title="Set password"
      subtitle="Invitation / first-time password (mock). Verify `/api/auth/set-password` with backend."
    >
      {message ? <div className="sl-alert sl-alert--info">{message}</div> : null}
      <form onSubmit={onSubmit}>
        <FormField id="password" label="Password" required>
          <TextInput
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
            required
          />
        </FormField>
        <Button type="submit" variant="primary" block>
          Set password
        </Button>
      </form>
      <p style={{ marginTop: 16, fontSize: 'var(--sl-text-sm)' }}>
        <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
