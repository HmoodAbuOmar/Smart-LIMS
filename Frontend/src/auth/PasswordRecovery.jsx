import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { authApi as patientApi } from './api.js'
import { actionErrorKey } from './access.js'
import { readLinkToken, clearLinkToken, validateEmail, validatePasswordReset } from '../services/emailFlow.js'
import useFormAction from '../utils/useFormAction.js'

export default function PasswordRecovery({ reset = false }) {
  const { t } = useTranslation('auth')
  const token = useRef(reset ? readLinkToken(window.location) : '')
  const [values, setValues] = useState({ email: '', password: '', confirmPassword: '' })
  const [visible, setVisible] = useState({})
  const [completed, setCompleted] = useState(false)
  const fields = reset ? ['password', 'confirmPassword'] : ['email']
  useEffect(() => { if (reset) clearLinkToken() }, [reset])
  const { errors, clearField, pending, failure, submit } = useFormAction({
    values, fields, validate: reset ? validatePasswordReset : validateEmail,
    action: (details, options) => {
      if (!reset) return patientApi.requestPasswordReset({ email: details.email.trim() }, options)
      if (!token.current) { const error = new Error('Reset link is required'); error.code = 'TOKEN_INVALID'; throw error }
      return patientApi.resetPassword({ token: token.current, password: details.password }, options)
    },
    onSuccess: result => {
      if ((reset ? result?.passwordReset : result?.accepted) !== true) throw new Error('Recovery request was not confirmed')
      if (reset) token.current = ''
      setCompleted(true)
      setValues({ email: '', password: '', confirmPassword: '' })
    },
  })
  return <>
    <div className="eyebrow">{t('recovery.label')}</div>
    <h1 id="auth-heading" tabIndex={-1}>{t(reset ? 'recovery.resetTitle' : 'recovery.title')}</h1>
    <p id="auth-description">{t(reset ? 'recovery.resetDescription' : 'recovery.description')}</p>
    {completed ? <p className="auth-supporting" role="status">{t(reset ? 'recovery.resetComplete' : 'recovery.requestAccepted')}</p> : <form noValidate onSubmit={submit} aria-busy={pending}>
      {fields.map(field => {
        const password = field !== 'email'
        const id = 'recovery-' + field
        const visibilityKey = field === 'confirmPassword' ? 'ConfirmPassword' : 'Password'
        return <div className="auth-field" key={field}>
          <label htmlFor={id}>{t('fields.' + field)}</label>
          <div className={password ? 'auth-password' : undefined}>
            <input id={id} name={field} type={password ? visible[field] ? 'text' : 'password' : 'email'}
              dir={password ? undefined : 'ltr'} autoComplete={password ? 'new-password' : 'email'} required disabled={pending}
              value={values[field]} onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); clearField(field) }}
              aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? id + '-error' : field === 'password' ? 'recovery-password-hint' : undefined} />
            {password && <button type="button" className="auth-password-toggle" disabled={pending} aria-controls={id} aria-pressed={Boolean(visible[field])}
              aria-label={t((visible[field] ? 'hide' : 'show') + visibilityKey)} onClick={() => setVisible(previous => ({ ...previous, [field]: !previous[field] }))}>
              {visible[field] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>}
          </div>
          {field === 'password' && <small id="recovery-password-hint">{t('passwordHint')}</small>}
          {errors[field] && <span id={id + '-error'} className="auth-error" role="alert">{t('errors.' + errors[field])}</span>}
        </div>
      })}
      <button type="submit" className="auth-submit" disabled={pending}>{t(pending ? 'actions.loading' : reset ? 'recovery.resetSubmit' : 'recovery.submit')}</button>
      {failure && <p className="auth-error" role="alert">{t(actionErrorKey(failure, 'errors.recoveryUnavailable'))}</p>}
    </form>}
    <a className="auth-switch" href="#/login">{t('workflow.backLogin')}</a>
  </>
}
