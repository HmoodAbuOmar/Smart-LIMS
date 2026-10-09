import { useState } from 'react'
import { Link } from '../../lib/router/RouterContext'
import { useAuth } from '../../lib/auth/AuthContext'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Button } from '../../components/ui/Button'

export function RegisterPage() {
  const { register, authNotice } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    const result = await register({ fullName, email, password })
    setMessage(result.message ?? authNotice)
  }

  return (
    <AuthLayout
      title="Patient registration"
      subtitle="Form layout only — `/api/auth/register` contract not verified in this repo."
    >
      {message ? <div className="sl-alert sl-alert--warning">{message}</div> : null}
      <form onSubmit={onSubmit}>
        <FormField id="fullName" label="Full name" required>
          <TextInput
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </FormField>
        <FormField id="email" label="Email" required>
          <TextInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>
        <FormField id="password" label="Password" required>
          <TextInput
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </FormField>
        <Button type="submit" variant="primary" block>
          Register
        </Button>
      </form>
      <p style={{ marginTop: 16, fontSize: 'var(--sl-text-sm)' }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
