import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Button } from '../../components/ui/Button'
import { DEMO_ACCOUNTS } from '../../mocks/demoAccounts'
import { ROLE_LABELS } from '../../lib/constants/roles'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('patient@smartlims.demo')
  const [password, setPassword] = useState('demo')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const signInAs = async (accountEmail) => {
    setEmail(accountEmail)
    setPassword('demo')
    setLoading(true)
    setError(null)
    const result = await login({ email: accountEmail, password: 'demo' })
    if (!result.ok) setError(result.message)
    setLoading(false)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await login({ email, password })
    if (!result.ok) setError(result.message)
    setLoading(false)
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Demo login for UI preview only — not real authentication or security."
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
        <p style={{ margin: '8px 0', fontSize: 'var(--sl-text-sm)' }}>
          Lab dashboard updates appear under <strong>Lab technician</strong> — not on the public home page.
        </p>
        <div className="sl-row" style={{ marginTop: 12 }}>
          {DEMO_ACCOUNTS.map((a) => (
            <Button
              key={a.email}
              type="button"
              variant={a.role === 'LAB_TECHNICIAN' ? 'primary' : 'secondary'}
              size="sm"
              disabled={loading}
              onClick={() => signInAs(a.email)}
            >
              {ROLE_LABELS[a.role] ?? a.role}
            </Button>
          ))}
        </div>
        <ul style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 'var(--sl-text-sm)' }}>
          {DEMO_ACCOUNTS.map((a) => (
            <li key={`${a.email}-line`}>
              {a.email}
            </li>
          ))}
        </ul>
      </div>
    </AuthLayout>
  )
}
