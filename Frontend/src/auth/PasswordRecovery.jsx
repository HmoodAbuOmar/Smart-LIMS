import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { authApi as patientApi } from './api.js'
import { actionErrorKey } from './access.js'
import { clearLinkToken, validateEmail, validatePasswordReset } from '../services/emailFlow.js'
import useFormAction from '../utils/useFormAction.js'

export default function PasswordRecovery({ reset = false }) {
  const { t } = useTranslation('auth')
  const [values, setValues] = useState({ email: '', code: '', password: '', confirmPassword: '' })
  const [visible, setVisible] = useState({})
  const [completed, setCompleted] = useState(false)
  useEffect(() => { if (reset) clearLinkToken() }, [reset])
  const fields = reset ? ['email', 'code', 'password', 'confirmPassword'] : ['email']
  const { errors, clearField, pending, failure, submit } = useFormAction({
    values, fields, validate: details => ({ ...validateEmail(details), ...(reset ? {
      ...validatePasswordReset(details), ...(/^\d{4}$/.test(details.code.trim()) ? {} : { code: 'resetCodeInvalid' }),
    } : {}) }),
    action: (details, options) => {
      if (!reset) return patientApi.requestPasswordReset({ email: details.email.trim() }, options)
      return patientApi.resetPassword({ email: details.email.trim(), code: details.code.trim(), newPassword: details.password }, options)
    },
    onSuccess: result => {
      if ((reset ? result?.passwordReset : result?.accepted) !== true) throw new Error('Recovery request was not confirmed')
      setCompleted(true)
      setValues({ email: '', code: '', password: '', confirmPassword: '' })
    },
  })
  return <>
    <div className="eyebrow">{t('recovery.label')}</div>
    <h1 id="auth-heading" tabIndex={-1}>{t(reset ? 'recovery.resetTitle' : 'recovery.title')}</h1>
    <p id="auth-description">{t(reset ? 'recovery.resetDescription' : 'recovery.description')}</p>
    {completed ? <><p className="auth-supporting" role="status">{t(reset ? 'recovery.resetComplete' : 'recovery.requestAccepted')}</p>{!reset && <a className="auth-submit" href="#/reset-password">{t('fields.code')}</a>}</> : <form noValidate onSubmit={submit} aria-busy={pending}>
      {fields.map(field => {
        const password = field === 'password' || field === 'confirmPassword'
        const id = 'recovery-' + field
        const visibilityKey = field === 'confirmPassword' ? 'ConfirmPassword' : 'Password'
        return <div className="auth-field" key={field}>
          <label htmlFor={id}>{t('fields.' + field)}</label>
          <div className={password ? 'auth-password' : undefined}>
            <input id={id} name={field} type={password ? visible[field] ? 'text' : 'password' : field === 'code' ? 'text' : 'email'}
              inputMode={field === 'code' ? 'numeric' : undefined} maxLength={field === 'code' ? 4 : undefined}
              dir={password ? undefined : 'ltr'} autoComplete={password ? 'new-password' : field === 'code' ? 'one-time-code' : 'email'} required disabled={pending}
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
