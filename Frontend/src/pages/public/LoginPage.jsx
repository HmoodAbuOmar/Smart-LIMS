import { useState } from 'react'
import { Link } from '../../lib/router/RouterContext'
import { useAuth } from '../../lib/auth/AuthContext'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Button } from '../../components/ui/Button'
import { DEMO_ACCOUNTS } from '../../mocks/demoAccounts'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('patient@smartlims.demo')
  const [password, setPassword] = useState('demo')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await login({ email, password })
    if (!result.ok) {
      setError(result.message)
    }
    setLoading(false)
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Mock authentication for UI review. Backend `/api/auth/login` is not connected."
    >
      {error ? <div className="sl-form-error-summary">{error}</div> : null}
      <form onSubmit={onSubmit}>
        <FormField id="email" label="Email" required>
          <TextInput
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>
        <FormField id="password" label="Password" required>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FormField>
        <Button type="submit" variant="primary" block disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p style={{ marginTop: 16, fontSize: 'var(--sl-text-sm)' }}>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
      <p style={{ fontSize: 'var(--sl-text-sm)' }}>
        No account? <Link to="/register">Register</Link>
      </p>
      <div className="sl-alert sl-alert--info" style={{ marginTop: 24 }}>
        <strong>Demo accounts</strong> (password: <code>demo</code>)
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              {a.role}: {a.email}
            </li>
          ))}
        </ul>
      </div>
    </AuthLayout>
  )
}
