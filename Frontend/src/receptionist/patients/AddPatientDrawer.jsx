import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { PATIENT_GENDERS, validateNewPatient } from './patientsModel.js'
import BirthDateField from './BirthDateField.jsx'

export default function AddPatientDrawer({ copy, language, service, onClose, onSaved, opener }) {
  const dialog = useRef(null)
  const lock = useRef(false)
  const live = useRef(false)
  const [values, setValues] = useState({ fullName: '', dateOfBirth: '', gender: '', phoneNumber: '', address: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    live.current = true
    const element = dialog.current
    const returnFocus = opener?.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    element.querySelector('input').focus()
    return () => { live.current = false; element.close(); document.body.style.overflow = overflow; if (returnFocus?.isConnected) returnFocus.focus() }
  }, [opener])
  function update(field, value) { setValues(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined, _form: undefined })) }
  function focusError(fields) { dialog.current.querySelector(`[name="${Object.keys(fields).find(key => key !== '_form')}"]`)?.focus() }
  async function submit(event) {
    event.preventDefault()
    if (lock.current) return
    const fields = validateNewPatient(values)
    setErrors(fields)
    if (Object.keys(fields).length) { focusError(fields); return }
    lock.current = true; setSaving(true)
    try {
      const patient = await service.create({ ...values })
      if (!patient?.id || !patient.patientNumber) throw new Error('No confirmed patient record')
      if (live.current) onSaved(patient)
    } catch (failure) {
      if (live.current) {
        const fields = Object.fromEntries(Object.entries(failure.fields || {}).filter(([field, code]) => ['fullName', 'dateOfBirth', 'gender', 'phoneNumber', 'address'].includes(field) && Object.hasOwn(copy.errors, code)))
        setErrors({ ...fields, _form: failure.code === 'SERVICE_UNAVAILABLE' ? 'saveUnavailable' : 'saveError' })
        requestAnimationFrame(() => { if (live.current) focusError(fields) })
      }
    } finally { lock.current = false; if (live.current) setSaving(false) }
  }
  const fieldError = field => errors[field] && <span id={`r02-error-${field}`} className="r02-field-error" role="alert">{copy.errors[errors[field]]}</span>
  const fieldProps = field => ({ name: field, id: `r02-${field}`, value: values[field], disabled: saving, 'aria-invalid': !!errors[field], 'aria-describedby': errors[field] ? `r02-error-${field}` : undefined, onChange: event => update(field, event.target.value) })
  return <dialog ref={dialog} className="r02-drawer" dir={language === 'ar' ? 'rtl' : 'ltr'} aria-labelledby="r02-drawer-title" onCancel={event => { event.preventDefault(); if (!lock.current) onClose() }}>
    <form noValidate onSubmit={event => void submit(event)} aria-busy={saving}>
      <header><h2 id="r02-drawer-title">{copy.add}</h2><button type="button" className="r02-close" aria-label={copy.close} disabled={saving} onClick={onClose}><X size={20} /></button></header>
      <div className="r02-drawer-body">
        <div className="r02-field"><label htmlFor="r02-fullName">{copy.name} <span aria-hidden="true">*</span></label><input {...fieldProps('fullName')} required maxLength={120} autoComplete="name" />{fieldError('fullName')}</div>
        <div className="r02-contact-row">
          <div className="r02-field"><label htmlFor="r02-dateOfBirth">{copy.dob} <span aria-hidden="true">*</span></label><BirthDateField value={values.dateOfBirth} onChange={value => update('dateOfBirth', value)} copy={copy} language={language} disabled={saving} invalid={!!errors.dateOfBirth} errorId={errors.dateOfBirth ? 'r02-error-dateOfBirth' : undefined} />{fieldError('dateOfBirth')}</div>
          <div className="r02-field"><label htmlFor="r02-phoneNumber">{copy.phone} <span aria-hidden="true">*</span></label><input {...fieldProps('phoneNumber')} type="tel" dir="ltr" required maxLength={20} autoComplete="tel" />{fieldError('phoneNumber')}</div>
        </div>
        <fieldset id="r02-gender" className="r02-gender" role="radiogroup" aria-required="true" aria-labelledby="r02-gender-label" aria-invalid={!!errors.gender} aria-describedby={errors.gender ? 'r02-error-gender' : undefined} disabled={saving}>
          <legend id="r02-gender-label">{copy.gender} <span aria-hidden="true">*</span></legend>
          <div className="r02-gender-options">{['MALE', 'FEMALE', 'UNKNOWN'].map(gender => <label key={gender} htmlFor={`r02-gender-${gender}`} title={!PATIENT_GENDERS.includes(gender) ? copy.errors.unsupportedGender : undefined}><input type="radio" id={`r02-gender-${gender}`} name="gender" value={gender} required disabled={!PATIENT_GENDERS.includes(gender)} checked={values.gender === gender} onChange={event => update('gender', event.target.value)} /><span>{copy[gender]}</span>{!PATIENT_GENDERS.includes(gender) && <small>{copy.errors.unsupportedGender}</small>}</label>)}</div>
        </fieldset>{fieldError('gender')}
        <div className="r02-field"><label htmlFor="r02-address">{copy.address}</label><textarea {...fieldProps('address')} rows={2} maxLength={500} autoComplete="street-address" />{fieldError('address')}</div>
        {errors._form && <p className="r02-field-error" role="alert">{copy[errors._form]}</p>}
      </div>
      <div className="r02-link-notice"><AlertTriangle size={17} aria-hidden="true" /><p>{copy.linking}</p></div>
      <footer><button type="button" disabled={saving} onClick={onClose}>{copy.cancel}</button><button type="submit" className="r02-primary" disabled={saving}>{saving ? copy.saving : copy.save}</button></footer>
    </form>
  </dialog>
}
