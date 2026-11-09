import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { authApi as patientApi } from './api.js'
import { actionErrorKey } from './access.js'
import useFormAction from '../utils/useFormAction.js'
import { toRegistrationPayload, registrationFields, validateRegistration } from '../services/registration.js'

const initialValues = Object.fromEntries(registrationFields.map(field => [field, '']))
const types = { email: 'email' }
const autocomplete = { name: 'name', email: 'email', password: 'new-password', confirmPassword: 'new-password' }

export default function RegistrationForm({ onRegistered }) {
  const { t } = useTranslation('auth')
  const [values, setValues] = useState(initialValues)
  const [visible, setVisible] = useState({})
  const { errors, setErrors, clearField, pending, failure, submit } = useFormAction({
    values, fields: registrationFields, validate: validateRegistration,
    action: (details, options) => patientApi.registerAccount(toRegistrationPayload(details), options),
    onSuccess: result => {
      if (result?.accountCreated !== true || result.verificationEmailSent !== true || typeof result.verificationId !== 'string' || !result.verificationId.trim()) throw new Error('Registration and verification delivery were not confirmed')
      onRegistered?.({ email: values.email.trim(), verificationId: result.verificationId, emailSent: true })
      window.location.hash = '/verify-email'
    },
  })

  function update(field, value) {
    setValues(previous => ({ ...previous, [field]: value }))
    clearField(field)
  }

  return <>
    <div className="eyebrow">{t('signup.label')}</div>
    <h1 id="auth-heading" tabIndex={-1}>{t('signup.heading')}</h1>
    <p id="auth-description">{t('registration.description')}</p>
    <form className="registration-form" noValidate onSubmit={submit} aria-busy={pending}>
      {registrationFields.map(field => {
        const password = field === 'password' || field === 'confirmPassword'
        const id = `registration-${field}`
        const visibilityKey = field === 'confirmPassword' ? 'ConfirmPassword' : 'Password'
        const shared = {
          id, name: field, value: values[field], required: true, disabled: pending,
          onChange: event => update(field, event.target.value),
          onBlur: () => setErrors(previous => ({ ...previous, [field]: validateRegistration(values)[field] })),
          'aria-invalid': Boolean(errors[field]),
          'aria-describedby': [field === 'password' ? 'registration-password-hint' : '', errors[field] ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
        }
        return <div className={`auth-field${['name', 'email'].includes(field) ? ' registration-wide' : ''}`} key={field}>
          <label htmlFor={id}>{t(`fields.${field}`)}</label>
          <div className={password ? 'auth-password' : undefined}>
            <input {...shared}
              type={password ? (visible[field] ? 'text' : 'password') : types[field] || 'text'}
              autoComplete={autocomplete[field]}
              dir={field === 'email' ? 'ltr' : undefined}
              autoCapitalize={field === 'name' ? 'words' : 'none'}
              spellCheck={field === 'name'}
            />
            {password && <button type="button" className="auth-password-toggle" disabled={pending}
              aria-label={t(`${visible[field] ? 'hide' : 'show'}${visibilityKey}`)}
              aria-pressed={Boolean(visible[field])} aria-controls={id}
              onClick={() => setVisible(previous => ({ ...previous, [field]: !previous[field] }))}
            >{visible[field] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}
          </div>
          {field === 'password' && <small id="registration-password-hint">{t('passwordHint')}</small>}
          {errors[field] && <span className="auth-error" id={`${id}-error`} role="alert">{t(`errors.${errors[field]}`)}</span>}
        </div>
      })}
      <button className="button auth-submit registration-wide" type="submit" disabled={pending}>{t(pending ? 'actions.creatingAccount' : 'signup.submit')}<ArrowRight size={17} aria-hidden="true" /></button>
      {failure && <p className="auth-error registration-wide" role="alert">{t(actionErrorKey(failure, 'errors.accountUnavailable'))}</p>}
    </form>
    <a className="auth-switch" href="#/login">{t('signup.switch')}</a>
  </>
}
