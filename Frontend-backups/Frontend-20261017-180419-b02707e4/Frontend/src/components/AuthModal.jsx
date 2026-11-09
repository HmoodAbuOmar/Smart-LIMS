import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Eye, EyeOff, X } from 'lucide-react'
import { validateAuth } from '../utils/authValidation.js'
import './AuthModal.css'

function AuthForm({ mode, onModeChange }) {
  const { t } = useTranslation(['auth', 'common'])
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [visible, setVisible] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const signup = mode === 'signup'
  const fields = signup ? ['name', 'email', 'password', 'confirmPassword'] : ['email', 'password']

  function updateValue(field, value) {
    setValues(previous => ({ ...previous, [field]: value }))
    setErrors(previous => ({ ...previous, [field]: undefined, ...(field === 'password' ? { confirmPassword: undefined } : {}) }))
    setSubmitted(false)
  }

  function submit(event) {
    event.preventDefault()
    const nextErrors = validateAuth(values, mode)
    setErrors(nextErrors)
    const firstInvalid = fields.find(field => nextErrors[field])
    if (firstInvalid) {
      event.currentTarget.elements.namedItem(firstInvalid)?.focus()
      return
    }
    // There is no configured frontend authentication integration. Never send
    // credentials to a guessed endpoint, mail client, or browser storage.
    setSubmitted(true)
  }

  return <>
    <div className="eyebrow">{t(`auth:${mode}.label`)}</div>
    <h2 id="auth-heading">{t(`auth:${mode}.heading`)}</h2>
    <p id="auth-description">{t(`auth:${mode}.description`)}</p>
    <form noValidate onSubmit={submit}>
      {fields.map((field, index) => {
        const password = field === 'password' || field === 'confirmPassword'
        const id = `auth-${field}`
        const errorId = `${id}-error`
        const hint = signup && field === 'password'
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
              required
              autoFocus={index === 0}
              autoComplete={field === 'name' ? 'name' : field === 'email' ? 'username' : signup ? 'new-password' : 'current-password'}
              dir={field === 'email' ? 'ltr' : undefined}
              lang={field === 'email' ? 'en' : undefined}
              placeholder={t(`auth:fields.${field}`)}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={[hint ? 'auth-password-hint' : '', errors[field] ? errorId : ''].filter(Boolean).join(' ') || undefined}
              autoCapitalize={field === 'name' ? 'words' : 'none'}
              spellCheck={field === 'name'}
            />
            {password && <button
              className="auth-password-toggle"
              type="button"
              aria-label={t(`auth:${visible[field] ? 'hide' : 'show'}${visibilityKey}`)}
              aria-pressed={Boolean(visible[field])}
              aria-controls={id}
              onClick={() => setVisible(previous => ({ ...previous, [field]: !previous[field] }))}
            >{visible[field] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}
          </div>
          {hint && <small id="auth-password-hint">{t('auth:passwordHint')}</small>}
          {errors[field] && <span className="auth-error" id={errorId} role="alert">{t(`auth:errors.${errors[field]}`)}</span>}
        </div>
      })}
      <button className="button button-primary auth-submit" type="submit">
        {t(`auth:${mode}.submit`)}<ArrowRight size={17} aria-hidden="true" />
      </button>
      {submitted && <span className="auth-error" role="alert">{t(`auth:errors.${mode}Unavailable`)}</span>}
    </form>
    <button type="button" className="auth-switch" onClick={() => onModeChange(signup ? 'login' : 'signup')}>
      {t(`auth:${mode}.switch`)}
    </button>
  </>
}

export default function AuthModal({ mode, onModeChange, onClose }) {
  const { t } = useTranslation('common')
  const dialogRef = useRef(null)
  const open = mode !== null

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    dialog.querySelector('input')?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      dialog.close()
    }
  }, [open])

  function switchMode(next) {
    onModeChange(next)
    dialogRef.current.scrollTop = 0
  }

  return <dialog
    ref={dialogRef}
    className="modal-surface auth-dialog"
    aria-labelledby="auth-heading"
    aria-describedby="auth-description"
    onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) dialogRef.current.close() }}
  >
    <button type="button" className="dialog-close" aria-label={t('close')} onClick={() => dialogRef.current.close()}>
      <X size={21} aria-hidden="true" />
    </button>
    {mode && <AuthForm key={mode} mode={mode} onModeChange={switchMode} />}
  </dialog>
}
