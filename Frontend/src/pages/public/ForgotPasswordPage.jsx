import { useState } from 'react'
import { Link } from '../../lib/router/RouterContext'
import { useAuth } from '../../lib/auth/AuthContext'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { FormField } from '../../components/ui/FormField'
import { TextInput } from '../../components/ui/TextInput'
import { Button } from '../../components/ui/Button'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    const result = await requestPasswordReset({ email })
    setMessage(result.message)
  }

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Request a reset link (mock). Verify `/api/auth/forgot-password` before go-live."
    >
      {message ? <div className="sl-alert sl-alert--info">{message}</div> : null}
      <form onSubmit={onSubmit}>
        <FormField id="email" label="Email" required>
          <TextInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>
        <Button type="submit" variant="primary" block>
          Send reset link
        </Button>
      </form>
      <p style={{ marginTop: 16, fontSize: 'var(--sl-text-sm)' }}>
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
