import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authApi } from './api.js'
import { clearLinkToken, readLinkToken } from '../services/emailFlow.js'
import useFormAction from '../utils/useFormAction.js'
import EmailVerificationCard from './EmailVerificationCard.jsx'

export default function EmailVerification({ registration }) {
  const { t } = useTranslation('auth')
  const [link] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.split('?')[1])
    return { token: readLinkToken(window.location), userId: params.get('userId') || hash.get('userId') }
  })
  const [status, setStatus] = useState(link.token && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(link.userId || '') ? 'invalid' : 'pending')
  useEffect(clearLinkToken, [])
  const { pending, failure, submit } = useFormAction({
    values: link, fields: [], validate: () => ({}),
    action: (values, options) => authApi.verifyEmail(values, options),
    onSuccess: result => setStatus(result.status),
  })
  const error = status === 'invalid' || failure === 'INVALID_VERIFICATION_TOKEN' ? 'errors.tokenInvalid' : failure ? 'errors.verificationUnavailable' : undefined
  return <EmailVerificationCard email={registration?.email} status={status} pending={pending} error={error}
    loginHref="/#/login" action={link.token && link.userId && !['verified', 'invalid'].includes(status)
      ? <form onSubmit={submit}><button type="submit" className="auth-submit" disabled={pending}>{t('verification.confirm')}</button></form>
      : <p>{t('verification.resendUnavailable')}</p>} />
}
