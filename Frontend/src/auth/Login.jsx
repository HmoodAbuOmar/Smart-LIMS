import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { validateAuth } from '../utils/authValidation.js'
import { authApi as patientApi } from './api.js'
import { authenticatedPatientDestination, actionErrorKey } from './access.js'
import useFormAction from '../utils/useFormAction.js'

export default function Login({ mode = 'login' }) {
  const { t } = useTranslation(['auth', 'common'])
  const [values, setValues] = useState({ email: '', password: '' })
  const [visible, setVisible] = useState({})
  const fields = ['email', 'password']
  const { errors, setErrors, clearField, pending, failure, submit } = useFormAction({
    values, fields, validate: details => validateAuth(details, 'login'),
    action: (details, options) => patientApi.login({ email: details.email.trim(), password: details.password }, options),
    onSuccess: async (_result, options) => {
      const destination = await authenticatedPatientDestination(options)
      if (destination === '#/login') throw new Error('Authentication was not confirmed')
      window.location.hash = destination.slice(1)
    },
  })

  function updateValue(field, value) {
    setValues(previous => ({ ...previous, [field]: value }))
    clearField(field)
  }

  return <>
    <div className="eyebrow">{t(`auth:${mode}.label`)}</div>
    <h1 id="auth-heading" tabIndex={-1}>{t(`auth:${mode}.heading`)}</h1>
    <p id="auth-description">{t(`auth:${mode}.description`)}</p>
    <form noValidate onSubmit={submit} aria-busy={pending}>
      {fields.map((field, index) => {
        const password = field === 'password' || field === 'confirmPassword'
        const id = `auth-${field}`
        const errorId = `${id}-error`
        const visibilityKey = field === 'confirmPassword' ? 'ConfirmPassword' : 'Password'
        return <div className="auth-field" key={field}>
          <label htmlFor={id}>{t(`auth:fields.${field}`)}</label>
          <div className={password ? 'auth-password' : undefined}>
            <input
              id={id}
              name={field}
              type={password ? (visible[field] ? 'text' : 'password') : field === 'email' ? 'email' : 'text'}
              value={values[field]}
              onChange={event => updateValue(field, event.target.value)}
              onBlur={() => setErrors(previous => ({ ...previous, [field]: validateAuth(values, mode)[field] }))}
              required
              disabled={pending}
              autoFocus={index === 0}
              autoComplete={field === 'email' ? 'username' : 'current-password'}
              dir={field === 'email' ? 'ltr' : undefined}
              lang={field === 'email' ? 'en' : undefined}
              placeholder={t(`auth:fields.${field}`)}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={errors[field] ? errorId : undefined}
              autoCapitalize={field === 'name' ? 'words' : 'none'}
              spellCheck={field === 'name'}
            />
            {password && <button
              className="auth-password-toggle" disabled={pending}
              type="button"
              aria-label={t(`auth:${visible[field] ? 'hide' : 'show'}${visibilityKey}`)}
              aria-pressed={Boolean(visible[field])}
              aria-controls={id}
              onClick={() => setVisible(previous => ({ ...previous, [field]: !previous[field] }))}
            >{visible[field] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}
          </div>
          {errors[field] && <span className="auth-error" id={errorId} role="alert">{t(`auth:errors.${errors[field]}`)}</span>}
        </div>
      })}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}>
        {t(pending ? 'auth:actions.signingIn' : `auth:${mode}.submit`)}<ArrowRight size={17} aria-hidden="true" />
      </button>
      {failure && <p className="auth-error" role="alert">{t(actionErrorKey(failure, 'errors.loginUnavailable'))}</p>}
    </form>
    <a className="auth-switch" href="#/forgot-password">{t('auth:recovery.forgotLink')}</a>
    <a className="auth-switch" href="#/signup">
      {t(`auth:${mode}.switch`)}
    </a>
  </>
}
