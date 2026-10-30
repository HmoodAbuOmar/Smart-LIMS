import { useContext, useEffect, useState } from 'react'
import { FolderPlus, Link as LinkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { patientApi, authenticatedPatientDestination, patientDestination, actionErrorKey } from '../services/patientApi.js'
import useFormAction from '../utils/useFormAction.js'
import { genderOptions, localDateValue, patientDraftFields, validatePatientDraft, toPatientFilePayload, toFileLinkPayload, prepareFileLink } from '../services/onboarding.js'
import { emptyPatientFile, PatientFileState } from '../utils/patientFileState.js'
import './PatientOnboarding.css'

function PatientFileForm() {
  const { t } = useTranslation('auth')
  const state = useContext(PatientFileState)
  const [localValues, setLocalValues] = useState(emptyPatientFile)
  const values = state?.values || localValues
  const setValues = state?.setValues || setLocalValues
  const { errors, clearField, pending, failure, submit } = useFormAction({
    values, fields: patientDraftFields, validate: validatePatientDraft,
    action: (details, options) => patientApi.createFile(toPatientFilePayload(details), options),
    onSuccess: (result, options) => completeMedicalFile(result, 'fileCreated', options),
  })
  return <form className="registration-form" noValidate onSubmit={submit} aria-busy={pending}>
    {patientDraftFields.map(field => {
      const id = `patient-draft-${field}`
      const props = {
        id, name: field, value: values[field], required: true, disabled: pending,
        onChange: event => { setValues(previous => ({ ...previous, [field]: event.target.value })); clearField(field) },
        'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `${id}-error` : undefined,
      }
      return <div className={`auth-field${['name', 'phone'].includes(field) ? ' registration-wide' : ''}`} key={field}>
        <label htmlFor={id}>{t(`fields.${field}`)}</label>
        {field === 'gender' ? <select {...props}>
          <option value="">{t('registration.chooseGender')}</option>
          {genderOptions.map(gender => <option key={gender} value={gender}>{t(`registration.genders.${gender}`)}</option>)}
        </select> : <input {...props} type={field === 'dateOfBirth' ? 'date' : field === 'phone' ? 'tel' : 'text'}
          dir={field === 'phone' ? 'ltr' : undefined}
          autoComplete="off"
          min={field === 'dateOfBirth' ? '1900-01-01' : undefined}
          max={field === 'dateOfBirth' ? localDateValue() : undefined} />}
        {errors[field] && <span id={`${id}-error`} className="auth-error" role="alert">{t(`errors.${errors[field]}`)}</span>}
      </div>
    })}
    <button className="auth-submit registration-wide" type="submit" disabled={pending}>{t(pending ? 'actions.creatingFile' : 'workflow.createFile')}</button>
    {failure && <p className="auth-error registration-wide" role="alert">{t(actionErrorKey(failure, 'errors.fileUnavailable'))}</p>}
  </form>
}

function ExistingFileLink() {
  const { t } = useTranslation('auth')
  const [values, setValues] = useState({ fileIdentifier: '' })
  const { errors, clearField, pending, failure, submit } = useFormAction({
    values, fields: ['fileIdentifier'], validate: details => prepareFileLink(details).errors,
    action: (details, options) => patientApi.linkFile(toFileLinkPayload(details), options),
    onSuccess: (result, options) => completeMedicalFile(result, 'verifiedLink', options),
  })
  return <form noValidate onSubmit={submit} aria-busy={pending}>
    <div className="auth-field">
      <label htmlFor="file-identifier">{t('workflow.identifierLabel')}</label>
      <input id="file-identifier" name="fileIdentifier" value={values.fileIdentifier} required autoComplete="off" disabled={pending}
        onChange={event => { setValues({ fileIdentifier: event.target.value }); clearField('fileIdentifier') }}
        aria-invalid={Boolean(errors.fileIdentifier)}
        aria-describedby={errors.fileIdentifier ? 'file-identifier-error' : undefined} />
      {errors.fileIdentifier && <span className="auth-error" id="file-identifier-error" role="alert">{t('errors.fileIdentifierRequired')}</span>}
    </div>
    <button type="submit" className="auth-submit" disabled={pending}>{t(pending ? 'actions.linkingFile' : 'workflow.linkFile')}</button>
    {failure && <p className="auth-error" role="alert">{t(actionErrorKey(failure, 'errors.linkUnavailable'))}</p>}
  </form>
}

async function completeMedicalFile(result, confirmation, options) {
  if (result?.[confirmation] !== true) throw new Error('Medical file operation was not confirmed')
  const destination = await authenticatedPatientDestination(options)
  if (destination !== '#/patient/dashboard') throw new Error('Verified medical-file access is required')
  window.location.hash = destination.slice(1)
}

function DashboardAccess() {
  const { t } = useTranslation('auth')
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setState('loading')
      try {
        const destination = patientDestination(await patientApi.getAccess({ signal: controller.signal }))
        if (controller.signal.aborted) return
        if (destination === '#/login' || destination === '#/patient/file') {
          window.location.hash = destination.slice(1)
          return
        }
        // Mount the existing dashboard here once its authenticated component exists.
        setState('unavailable')
      } catch { if (!controller.signal.aborted) setState('unavailable') }
    }
    void load()
    return () => controller.abort()
  }, [attempt])
  return <div aria-busy={state === 'loading'}>
    {state === 'loading' ? <p role="status">{t('actions.loading')}</p> : <>
      <p className="auth-error" role="alert">{t('errors.dashboardUnavailable')}</p>
      <button type="button" className="auth-secondary" onClick={() => setAttempt(previous => previous + 1)}>{t('actions.retry')}</button>
      <a className="auth-switch" href="#/login">{t('tabs.login')}</a>
    </>}
  </div>
}

export function PatientOnboardingContent({ step }) {
  const { t } = useTranslation('auth')
  return <>
    <div className="eyebrow">{t('workflow.label')}</div>
    <h1 id="auth-heading" tabIndex={-1}>{t('workflow.titles.' + step)}</h1>
    <p id="auth-description">{t('workflow.descriptions.' + step)}</p>
    {step === 'selection' && <div className="workflow-choices patient-file-options">
      <a className="workflow-choice" href="#/patient/file/new">
        <span className="patient-choice-icon"><FolderPlus size={23} aria-hidden="true" /></span>
        <strong>{t('workflow.newFileOption')}</strong><span>{t('workflow.newFileHint')}</span>
        <span className="auth-submit patient-choice-action">{t('workflow.newFileButton')}</span>
      </a>
      <a className="workflow-choice" href="#/patient/file/link">
        <span className="patient-choice-icon"><LinkIcon size={23} aria-hidden="true" /></span>
        <strong>{t('workflow.existingFileOption')}</strong><span>{t('workflow.linkFileHint')}</span>
        <span className="auth-submit patient-choice-action">{t('workflow.linkFileButton')}</span>
      </a>
    </div>}
    {step === 'createFile' && <PatientFileForm />}
    {step === 'linkFile' && <ExistingFileLink />}
    {step === 'dashboard' && <DashboardAccess />}
    <div className="workflow-back">
      <a className="auth-switch" href={step === 'selection' ? '#/login' : '#/patient/file'}>{t(step === 'selection' ? 'workflow.backLogin' : 'workflow.backSelection')}</a>
    </div>
  </>
}

export default function PatientOnboarding({ step }) {
  const { t } = useTranslation('auth')
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const fileState = useContext(PatientFileState)
  const bindOwner = fileState?.bindOwner
  const clearDraft = fileState?.clear
  useEffect(() => {
    const controller = new AbortController()
    async function authorize() {
      setState('loading')
      try {
        const access = await patientApi.getAccess({ signal: controller.signal })
        const destination = patientDestination(access)
        if (controller.signal.aborted) return
        if (!destination) { clearDraft?.(); setState('denied'); return }
        if (destination === '#/login' || destination === '#/verify-email' || (step === 'dashboard' && destination !== '#/patient/dashboard') || (step !== 'dashboard' && destination === '#/patient/dashboard')) {
          clearDraft?.()
          window.location.hash = destination.slice(1)
          return
        }
        bindOwner?.(access.userId)
        setState('authorized')
      } catch { if (!controller.signal.aborted) { clearDraft?.(); setState('unavailable') } }
    }
    void authorize()
    return () => controller.abort()
  }, [step, attempt, bindOwner, clearDraft])
  if (state === 'authorized') return <PatientOnboardingContent step={step} />
  return <div aria-busy={state === 'loading'}>
    <h1 id="auth-heading" tabIndex={-1}>{t('workflow.titles.' + step)}</h1>
    {state === 'loading' ? <p role="status">{t('actions.loading')}</p> : <>
      <p className="auth-error" role="alert">{t(state === 'denied' ? 'errors.accessDenied' : 'errors.accessUnavailable')}</p>
      <button type="button" className="auth-secondary" onClick={() => setAttempt(previous => previous + 1)}>{t('actions.retry')}</button>
      <a className="auth-switch" href="#/login">{t('workflow.backLogin')}</a>
    </>}
  </div>
}
