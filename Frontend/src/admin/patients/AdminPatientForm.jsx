import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { patientName, todayValue, validatePatient } from './adminPatientsModel.js'
import AdminPatientAvatar from './AdminPatientAvatar.jsx'

export default function AdminPatientForm({ patient, language, onToggleLanguage, copy, service, onSaved, onClose }) {
  const dialog = useRef(null)
  const submitting = useRef(false)
  const mounted = useRef(false)
  const [values, setValues] = useState(() => patient ? { ...patient } : { nameAr: '', nameEn: '', dateOfBirth: '', gender: 'UNKNOWN', phone: '', address: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    mounted.current = true
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const element = dialog.current
    element.showModal()
    element.querySelector('input')?.focus()
    return () => {
      mounted.current = false
      element.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  function close() { if (!submitting.current) onClose() }
  function update(field, value) {
    setValues(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
    setFailed(false)
  }
  async function save(event) {
    event.preventDefault()
    if (submitting.current) return
    const nextErrors = validatePatient(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      dialog.current.querySelector(`[name="${Object.keys(nextErrors)[0]}"]`)?.focus()
      return
    }
    submitting.current = true
    setSaving(true)
    setFailed(false)
    try {
      const saved = await service.save(values, patient?.id)
      if (mounted.current) onSaved(saved)
    } catch {
      if (mounted.current) setFailed(true)
    } finally {
      submitting.current = false
      if (mounted.current) setSaving(false)
    }
  }
  const fields = ['nameAr', 'nameEn', 'dateOfBirth', 'gender', 'phone', 'address']
  return <dialog ref={dialog} className="admin-patients-dialog" aria-labelledby="patient-form-title" aria-describedby="patient-form-guidance"
    onCancel={event => { event.preventDefault(); close() }} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <div className="ap-dialog-heading"><h2 id="patient-form-title">{patient ? copy.edit : copy.add}</h2><div className="ap-dialog-controls">{onToggleLanguage && <button type="button" className="ap-language" lang={language === 'ar' ? 'en' : 'ar'} onClick={onToggleLanguage}>{copy.switchLanguage}</button>}<button type="button" className="ap-icon" disabled={saving} aria-label={copy.close} onClick={close}><X size={20} aria-hidden="true" /></button></div></div>
    <form onSubmit={save} noValidate aria-busy={saving}>
      {patient && <div className="ap-form-identity"><AdminPatientAvatar patient={patient} language={language} /><div><strong>{patientName(patient, language)}</strong><bdi className="ap-file-number">{patient.fileNumber}</bdi></div></div>}
      <p id="patient-form-guidance" className="ap-muted">{copy.guidance}</p>
      {fields.map(field => <div className={`ap-field ap-field-${field}`} key={field}>
        <label htmlFor={`patient-${field}`}>{copy[field]}{field !== 'address' && <span aria-hidden="true"> *</span>}</label>
        {field === 'gender' ? <select id={`patient-${field}`} name={field} value={values[field]} disabled={saving} required aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `patient-error-${field}` : undefined} onChange={event => update(field, event.target.value)}>
          {Object.entries(copy.genders).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select> : field === 'address' ? <textarea id={`patient-${field}`} name={field} rows={3} value={values[field] || ''} disabled={saving} onChange={event => update(field, event.target.value)} /> :
          <input id={`patient-${field}`} name={field} type={field === 'dateOfBirth' ? 'date' : 'text'} inputMode={field === 'phone' ? 'tel' : undefined} dir={field === 'nameAr' ? 'rtl' : ['nameEn', 'phone'].includes(field) ? 'ltr' : undefined} lang={field === 'nameAr' ? 'ar' : field === 'nameEn' ? 'en' : undefined}
            autoComplete={['nameAr', 'nameEn'].includes(field) ? 'name' : field === 'phone' ? 'tel' : 'bday'}
            max={field === 'dateOfBirth' ? todayValue() : undefined} min={field === 'dateOfBirth' ? '0001-01-01' : undefined}
            maxLength={['nameAr', 'nameEn'].includes(field) ? 120 : field === 'phone' ? 20 : undefined}
            value={values[field]} required disabled={saving} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `patient-error-${field}` : undefined} onChange={event => update(field, event.target.value)} />}
        {errors[field] && <span id={`patient-error-${field}`} className="ap-error" role="alert">{copy.errors[errors[field]]}</span>}
      </div>)}
      {failed && <p role="alert" className="ap-error">{copy.saveError}</p>}
      <div className="ap-form-actions"><button type="button" disabled={saving} onClick={close}>{copy.cancel}</button><button type="submit" className="ap-primary" disabled={saving}>{saving ? copy.saving : copy.save}</button></div>
    </form>
  </dialog>
}
