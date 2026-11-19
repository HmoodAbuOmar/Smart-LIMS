import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useFormAction from '../utils/useFormAction.js'
import { acceptAccountInvitation } from './cookieSession.js'

const fields = ['password', 'confirmPassword']

function validate({ password, confirmPassword }) {
  const errors = {}
  const length = [...password].length
  if (!length) errors.password = 'errors.passwordRequired'
  else if (length < 8 || length > 100) errors.password = 'invitation.passwordLength'
  if (password !== confirmPassword) errors.confirmPassword = 'errors.passwordMismatch'
  return errors
}

export default function SetInvitedPassword() {
  const { t } = useTranslation('auth')
  const [invite] = useState(() => {
    const query = new URLSearchParams(window.location.search)
    return { userId: query.get('userId'), token: query.get('token') }
  })
  const [values, setValues] = useState({ password: '', confirmPassword: '' })
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const { errors, clearField, pending, failure, submit } = useFormAction({
    values, fields, validate,
    action: ({ password }, options) => acceptAccountInvitation({ ...invite, newPassword: password }, options),
    onSuccess: () => window.location.replace('/#/login'),
  })
  const valid = invite.token && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(invite.userId || '')
  return <>
    <h1 id="auth-heading" tabIndex={-1}>{t('invitation.title')}</h1>
    <p id="auth-description">{t('invitation.passwordLength')}</p>
    {valid ? <form noValidate onSubmit={submit} aria-busy={pending}>
      {fields.map(field => <div className="auth-field" key={field}>
        <label htmlFor={`invitation-${field}`}>{t(`fields.${field}`)}</label>
        <input id={`invitation-${field}`} name={field} type="password" autoComplete="new-password" required
          disabled={pending} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `invitation-${field}-error` : undefined}
          value={values[field]} onChange={event => {
            setValues(previous => ({ ...previous, [field]: event.target.value }))
            clearField(field)
          }} />
        {errors[field] && <span id={`invitation-${field}-error`} className="auth-error" role="alert">{t(errors[field])}</span>}
      </div>)}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}>{t(pending ? 'actions.loading' : 'invitation.title')}</button>
      {failure && <p className="auth-error" role="alert">{t(failure === 'INVALID_INVITATION' ? 'errors.tokenInvalid' : 'invitation.failed')}</p>}
    </form> : <p className="auth-error" role="alert">{t('errors.tokenInvalid')}</p>}
  </>
}
