import { createContext, useContext, useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import EmailVerificationCard from '../components/EmailVerificationCard.jsx'
import { AuthLayout } from '../components/AuthModal.jsx'
import { PatientOnboardingContent } from '../components/PatientOnboarding.jsx'
import { registrationFields, validateRegistration } from '../services/registration.js'
import { patientDraftFields, genderOptions, localDateValue, validatePatientDraft, prepareFileLink } from '../services/onboarding.js'
import { validateAuth } from '../utils/authValidation.js'
import './PatientPreview.css'
import DevelopmentPortal from './DevelopmentPortal.jsx'
import { flowStep, stepRoutes } from './flowRoutes.js'

// Compile-time DEV-only UI state. No API imports, session flags, tokens or storage.
const Walkthrough = createContext(null)
const nextStep = { signup: 'verify-email', 'verify-email': 'login', login: 'patient-file', 'create-file': 'dashboard', 'link-file': 'dashboard' }
const retainedFields = { account: ['name', 'email'], login: ['email'], patient: ['name', 'dateOfBirth', 'gender', 'phone'] }
const copy = {
  en: {
    back: 'Back', home: 'Back to Home',
    fileFormat: 'Enter 1–64 letters or digits. Hyphens, underscores, slashes and periods are allowed.',
    resendHint: 'You can continue to Login.',
    patient: 'Patient', file: 'SAMPLE-001', activity: 'Laboratory activity',
    test: 'Laboratory panel', status: 'Status', date: 'Date', ready: 'Ready',
  },
  ar: {
    back: 'العودة', home: 'العودة إلى الرئيسية',
    fileFormat: 'أدخل من حرف أو رقم واحد إلى ٦٤. يمكن استخدام الشرطات والشرطات السفلية والشرطة المائلة والنقاط.',
    resendHint: 'يمكنك المتابعة إلى تسجيل الدخول.',
    patient: 'المريض', file: 'PAT-001', activity: 'النشاط المخبري',
    test: 'فحص مخبري', status: 'الحالة', date: 'التاريخ', ready: 'جاهز',
  },
}

function useCopy() {
  const { i18n } = useTranslation()
  return copy[i18n.resolvedLanguage === 'ar' ? 'ar' : 'en']
}

function initialState(start) {
  return { step: start || 'signup', history: [], account: { name: '', email: '' }, login: { email: '' }, patient: { name: '', dateOfBirth: '', gender: '', phone: '' } }
}

function reducer(state, action) {
  if (action.type === 'ROUTE') {
    if (state.step === action.step) return state
    const previous = state.history.lastIndexOf(action.step)
    return { ...state, step: action.step, history: previous >= 0 ? state.history.slice(0, previous) : [...state.history, state.step] }
  }
  if (action.type === 'EDIT' && retainedFields[action.group]?.includes(action.field)) {
    return { ...state, [action.group]: { ...state[action.group], [action.field]: action.value } }
  }
  let step
  if (action.type === 'NEXT') step = nextStep[state.step]
  if (action.type === 'CHOOSE' && state.step === 'patient-file' && ['create-file', 'link-file'].includes(action.path)) step = action.path
  if (action.type === 'TAB' && ['signup', 'login'].includes(action.step)) step = action.step
  if (action.type === 'BACK') {
    if (!state.history.length) return { ...state, step: ({ 'verify-email': 'signup', login: 'verify-email', 'patient-file': 'login', 'create-file': 'patient-file', 'link-file': 'patient-file', dashboard: 'patient-file' })[state.step] || 'signup' }
    return { ...state, step: state.history.at(-1), history: state.history.slice(0, -1) }
  }
  if (!step || step === state.step) return state
  return {
    ...state, step, history: [...state.history, state.step],
    ...(state.step === 'signup' && action.type === 'NEXT' ? { login: { email: state.account.email } } : {}),
  }
}

function WalkthroughForm({ screen }) {
  const { t } = useTranslation('auth')
  const c = useCopy()
  const { state, send } = useContext(Walkthrough)
  const group = screen === 'signup' ? 'account' : screen === 'login' ? 'login' : screen === 'create-file' ? 'patient' : null
  const fields = screen === 'signup' ? registrationFields : screen === 'login' ? ['email', 'password'] : screen === 'create-file' ? patientDraftFields : ['fileIdentifier']
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field, group ? state[group][field] || '' : ''])))
  const [errors, setErrors] = useState({})
  const [visible, setVisible] = useState({})
  const title = screen === 'signup' ? 'signup.heading' : screen === 'login' ? 'login.heading' : screen === 'create-file' ? 'workflow.titles.createFile' : 'workflow.titles.linkFile'
  const subtitle = screen === 'signup' ? 'registration.description' : screen === 'login' ? 'login.description' : screen === 'create-file' ? 'workflow.descriptions.createFile' : 'workflow.descriptions.linkFile'
  const submitLabel = screen === 'signup' ? 'signup.submit' : screen === 'login' ? 'login.submit' : screen === 'create-file' ? 'workflow.createFile' : 'workflow.linkFile'
  function update(field, value) {
    setValues(previous => ({ ...previous, [field]: value }))
    setErrors(previous => ({ ...previous, [field]: undefined, ...(field === 'password' ? { confirmPassword: undefined } : {}) }))
    if (group && retainedFields[group].includes(field)) send({ type: 'EDIT', group, field, value })
  }
  function submit(event) {
    event.preventDefault()
    const nextErrors = screen === 'signup' ? validateRegistration(values) : screen === 'login' ? validateAuth(values, 'login') : screen === 'create-file' ? validatePatientDraft(values) : prepareFileLink(values).errors
    // Walkthrough formatting only; the real backend identifier contract is unchanged.
    if (screen === 'link-file' && !nextErrors.fileIdentifier && !/^[\p{L}\p{N}][\p{L}\p{N}_/.-]{0,63}$/u.test(values.fileIdentifier.trim())) nextErrors.fileIdentifier = 'walkthroughFileFormat'
    setErrors(nextErrors)
    const first = fields.find(field => nextErrors[field])
    if (first) event.currentTarget.elements.namedItem(first)?.focus()
    else send({ type: 'NEXT' })
  }
  return <>
    <div className="eyebrow">{t(screen === 'signup' ? 'signup.label' : screen === 'login' ? 'login.label' : 'workflow.label')}</div>
    <h1 id="auth-heading" tabIndex={-1}>{t(title)}</h1>
    <p>{t(subtitle)}</p>
    <form noValidate onSubmit={submit} className={screen === 'signup' || screen === 'create-file' ? 'registration-form' : undefined}>
      {fields.map(field => {
        const password = field === 'password' || field === 'confirmPassword'
        const id = 'dev-field-' + field
        const hint = screen === 'signup' && field === 'password'
        const props = {
          id, name: field, value: values[field], required: true, autoComplete: 'off',
          onChange: event => update(field, event.target.value),
          'aria-invalid': Boolean(errors[field]),
          'aria-describedby': [hint ? 'dev-password-hint' : '', errors[field] ? id + '-error' : ''].filter(Boolean).join(' ') || undefined,
        }
        return <div className={'auth-field' + (['name', 'email', 'phone'].includes(field) ? ' registration-wide' : '')} key={field}>
          <label htmlFor={id}>{t(field === 'fileIdentifier' ? 'workflow.identifierLabel' : 'fields.' + field)}</label>
          {field === 'gender' ? <select {...props}>
            <option value="">{t('registration.chooseGender')}</option>
            {genderOptions.map(gender => <option key={gender} value={gender}>{t('registration.genders.' + gender)}</option>)}
          </select> : <div className={password ? 'auth-password' : undefined}>
            <input {...props} type={password ? visible[field] ? 'text' : 'password' : field === 'email' ? 'email' : field === 'dateOfBirth' ? 'date' : field === 'phone' ? 'tel' : 'text'}
              dir={['email', 'phone'].includes(field) ? 'ltr' : undefined}
              min={field === 'dateOfBirth' ? '1900-01-01' : undefined} max={field === 'dateOfBirth' ? localDateValue() : undefined} />
            {password && <button type="button" className="auth-password-toggle" aria-controls={id} aria-pressed={Boolean(visible[field])}
              aria-label={t((visible[field] ? 'hide' : 'show') + (field === 'confirmPassword' ? 'ConfirmPassword' : 'Password'))}
              onClick={() => setVisible(previous => ({ ...previous, [field]: !previous[field] }))}>
              {visible[field] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>}
          </div>}
          {hint && <small id="dev-password-hint">{t('passwordHint')}</small>}
          {errors[field] && <span className="auth-error" role="alert" id={id + '-error'}>{errors[field] === 'walkthroughFileFormat' ? c.fileFormat : t('errors.' + errors[field])}</span>}
        </div>
      })}
      <button type="submit" className="auth-submit registration-wide">{t(submitLabel)}{['signup', 'login'].includes(screen) && <ArrowRight size={17} aria-hidden="true" />}</button>
    </form>
    {screen === 'login' && <a className="auth-switch" href="#/forgot-password">{t('recovery.forgotLink')}</a>}
    <div className="walkthrough-links">
      {screen === 'signup' || screen === 'login' ? <button type="button" className="auth-switch" onClick={() => send({ type: 'TAB', step: screen === 'signup' ? 'login' : 'signup' })}>{t(screen === 'signup' ? 'signup.switch' : 'login.switch')}</button> : null}
      {screen === 'signup' && !state.history.length ? <a className="auth-switch" href="#home">{c.home}</a> : <button type="button" className="auth-switch" onClick={() => send({ type: 'BACK' })}>{screen === 'create-file' || screen === 'link-file' ? t('workflow.backSelection') : c.back}</button>}
    </div>
  </>
}

function VerificationStep() {
  const { t } = useTranslation('auth')
  const c = useCopy()
  const { state, send } = useContext(Walkthrough)
  const [resendHint, setResendHint] = useState(false)
  return <EmailVerificationCard email={state.account.email} status="pending" canResend onResend={event => { event.preventDefault(); setResendHint(true) }}
    navigation={<div className="walkthrough-verification-navigation">
      {resendHint && <p className="auth-supporting" role="status">{c.resendHint}</p>}
      <button type="button" className="auth-submit" onClick={() => send({ type: 'NEXT' })}>{t('verification.continueLogin')}</button>
      <button type="button" className="auth-switch" onClick={() => send({ type: 'BACK' })}>{c.back}</button>
    </div>} />
}

function ConnectedScreens() {
  const { state, send } = useContext(Walkthrough)
  const { i18n } = useTranslation()
  useEffect(() => {
    document.getElementById('auth-heading')?.focus()
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [state.step, i18n.resolvedLanguage])
  function navigate(event) {
    const anchor = event.target.closest('a')
    const href = anchor?.getAttribute('href')
    if (!['#/login', '#/signup', '#/patient/file/new', '#/patient/file/link'].includes(href)) return
    event.preventDefault()
    event.stopPropagation()
    if (href === '#/patient/file/new' || href === '#/patient/file/link') send({ type: 'CHOOSE', path: href.endsWith('/new') ? 'create-file' : 'link-file' })
    else if (state.step === 'patient-file' && href === '#/login') send({ type: 'BACK' })
    else send({ type: 'TAB', step: href === '#/signup' ? 'signup' : 'login' })
  }
  if (state.step === 'dashboard') return <div data-walkthrough-step="dashboard"><DevelopmentPortal onBack={() => send({ type: 'BACK' })} /></div>
  return <div onClickCapture={navigate} data-walkthrough-step={state.step}>
    <AuthLayout mode={['signup', 'verify-email'].includes(state.step) ? 'signup' : 'login'}>
      {state.step === 'verify-email' ? <VerificationStep /> : state.step === 'patient-file' ? <PatientOnboardingContent step="selection" /> : <WalkthroughForm key={state.step} screen={state.step} />}
    </AuthLayout>
  </div>
}

export default function DevelopmentWalkthrough({ route }) {
  const step = flowStep(route) || 'signup'
  const [storedState, dispatch] = useReducer(reducer, step, initialState)
  const state = { ...storedState, step }
  // Hash routing owns the visible step. Reload retains only that step; all form
  // values stay in memory, never in browser history, session storage or tokens.
  useEffect(() => { dispatch({ type: 'ROUTE', step }) }, [step])
  function send(action) {
    const next = reducer(state, action)
    dispatch(action)
    if (next.step !== step) window.location.hash = stepRoutes[next.step].slice(1)
  }
  if (!import.meta.env.DEV) return null
  return <Walkthrough.Provider value={{ state, send }}><ConnectedScreens /></Walkthrough.Provider>
}
