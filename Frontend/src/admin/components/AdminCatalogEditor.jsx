import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { catalogName, validateParameter, validateRange, validateTest } from '../adminCatalogModel.js'

export default function AdminCatalogEditor({ kind, record, test, parameter, data, service, copy, language, onToggleLanguage, onSaved, onClose, inline = false, onDirtyChange, onBusyChange, onActiveChange, registerForm }) {
  const modal = kind !== 'test' && !inline
  const root = useRef(null), busy = useRef(false), mounted = useRef(false)
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState(false), [errors, setErrors] = useState({}), [confirm, setConfirm] = useState(false), [translationAttention, setTranslationAttention] = useState(false)
  const [values, setValues] = useState(() => {
    if (kind === 'test') return record ? { ...record, sampleType: record.sampleType || ({ Blood: 'BLOOD', 'دم': 'BLOOD' }[record.sampleTypeEn || record.sampleTypeAr] ?? record.sampleTypeEn ?? record.sampleTypeAr ?? ''), price: (record.priceCents / 100).toFixed(2) } : { code: '', nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', price: '', sampleType: '', preparationEn: '', preparationAr: '', active: true }
    if (kind === 'parameter') return record ? { ...record } : { code: '', nameEn: '', nameAr: '', valueType: 'NUMERIC', unit: '', methodEn: '', methodAr: '', displayOrder: 0, required: false, active: true }
    if (kind === 'close') return { validTo: '' }
    return { sex: 'ANY', minAgeDays: '', maxAgeDays: '', lower: '', upper: '', referenceEn: '', referenceAr: '', validFrom: '', validTo: '' }
  })
  const [baseline] = useState(() => JSON.stringify(values))
  const dirty = JSON.stringify(values) !== baseline
  const title = kind === 'test' ? record ? copy.editTest : copy.newTest : kind === 'parameter' ? record ? copy.editParameter : copy.addParameter : kind === 'close' ? copy.closeRange : kind === 'deactivate' ? copy.confirmDeactivate : copy.addRange
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => { onBusyChange?.(saving) }, [saving, onBusyChange])
  useEffect(() => { if (kind === 'test') onActiveChange?.(values.active) }, [kind, values.active, onActiveChange])
  useEffect(() => {
    if (translationAttention) root.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [language, translationAttention, errors])
  useEffect(() => {
    if (!registerForm) return undefined
    registerForm({ setActive: active => { setValues(current => ({ ...current, active })); setConfirm(false) } })
    return () => registerForm(null)
  }, [registerForm])
  useEffect(() => {
    mounted.current = true
    const previousFocus = document.activeElement, previousOverflow = document.body.style.overflow, element = root.current
    if (modal) { document.body.style.overflow = 'hidden'; element.showModal(); element.querySelector('input,select,button')?.focus() }
    return () => { mounted.current = false; if (modal) { element.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) } onDirtyChange?.(false); onBusyChange?.(false) }
  }, [modal, onDirtyChange, onBusyChange])
  function close() { if (!busy.current) onClose() }
  function update(field, value) { setValues(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined, _form: undefined })); setFailed(false); setConfirm(false) }
  async function submit(event, confirmed = false) {
    event.preventDefault()
    if (busy.current) return
    const validation = kind === 'test' ? validateTest(values, data.tests, record?.id) : kind === 'parameter' ? validateParameter(values, data.parameters, test.id, record, data.ranges) : kind === 'range' ? validateRange(values, parameter, data.ranges) : kind === 'close' && !values.validTo ? { validTo: 'required' } : {}
    setErrors(validation)
    if (Object.keys(validation).length) {
      const keys = Object.keys(validation), suffix = language === 'ar' ? 'Ar' : 'En'
      const visible = keys.find(key => kind !== 'test' || !/(Ar|En)$/.test(key) || key.endsWith(suffix))
      if (kind === 'test' && !visible) { setTranslationAttention(true); onToggleLanguage?.() }
      else root.current.querySelector(`[name="${visible || keys[0]}"]`)?.focus()
      return
    }
    if (kind === 'test' && record?.active && !values.active && !confirmed) { setConfirm(true); return }
    busy.current = true; setSaving(true); setFailed(false)
    try {
      const saved = kind === 'test' ? await service.saveTest(values, record?.id) : kind === 'parameter' ? await service.saveParameter(values, test.id, record?.id) : kind === 'range' ? await service.saveRange(values, parameter.id) : kind === 'close' ? await service.closeRange(record.id, values.validTo) : await service.setTestActive(record.id, false)
      if (mounted.current) onSaved(saved)
    } catch (error) { if (mounted.current) { if (error.code === 'VALIDATION') setErrors(error.fields); else setFailed(true) } }
    finally { busy.current = false; if (mounted.current) setSaving(false) }
  }
  function field(name, label) {
    const fieldId = kind === 'range' ? `catalog-range-${name}` : `catalog-${name}`
    const checkbox = ['active', 'required'].includes(name), choices = name === 'valueType' ? ['NUMERIC', 'TEXT'] : name === 'sex' ? ['MALE', 'FEMALE', 'ANY'] : name === 'sampleType' ? ['WHOLE_BLOOD', 'BLOOD', 'SERUM', 'PLASMA', 'URINE', 'SWAB', 'OTHER', ...values.sampleType && !['WHOLE_BLOOD', 'BLOOD', 'SERUM', 'PLASMA', 'URINE', 'SWAB', 'OTHER'].includes(values.sampleType) ? [values.sampleType] : []] : null
    const textarea = /^(description|preparation|reference)/.test(name)
    const numeric = ['price', 'lower', 'upper', 'displayOrder', 'minAgeDays', 'maxAgeDays'].includes(name), date = ['validFrom', 'validTo'].includes(name)
    const locked = kind === 'parameter' && record?.historicallyUsed && ['unit', 'methodAr', 'methodEn', 'valueType'].includes(name)
    const required = ['code', 'nameAr', 'nameEn', 'price', 'sampleType', 'displayOrder', 'referenceAr', 'referenceEn'].includes(name) || (kind === 'close' && name === 'validTo')
    const props = { id: fieldId, name, disabled: saving || locked, value: values[name] ?? '', onChange: event => update(name, event.target.value), required, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `catalog-error-${kind}-${name}` : undefined, dir: name.endsWith('Ar') ? 'rtl' : name.endsWith('En') || numeric || ['unit', 'code'].includes(name) ? 'ltr' : undefined }
    return <div className={`ac-field${checkbox ? ' ac-checkbox' : ''}`} key={name}><label htmlFor={fieldId}>{typeof label === 'string' ? label : copy[name]}{required && <span aria-hidden="true"> *</span>}</label>
      {checkbox ? <input id={fieldId} name={name} type="checkbox" checked={Boolean(values[name])} disabled={saving} onChange={event => update(name, event.target.checked)} /> : choices ? <select {...props}>{name === 'sampleType' && <option value="">{copy.selectSampleType}</option>}{choices.map(value => <option key={value} value={value}>{copy[value] || value}</option>)}</select> : textarea ? <textarea {...props} rows={2} /> : <input {...props} type={date ? 'date' : 'text'} inputMode={numeric ? 'decimal' : undefined} maxLength={kind === 'test' ? name === 'code' ? 30 : name.startsWith('name') ? 150 : undefined : undefined} />}
      {errors[name] && <span className="ac-error" role="alert" id={`catalog-error-${kind}-${name}`}>{copy.errors[errors[name]]}</span>}
    </div>
  }
  const pair = (label, names) => <fieldset className="ac-field-group"><legend>{label}</legend><div className="ac-bilingual">{names.map(field)}</div></fieldset>
  const currency = <div className="ac-field"><label htmlFor="catalog-currency">{copy.currency}</label><input id="catalog-currency" value="ILS" readOnly dir="ltr" /></div>
  const suffix = language === 'ar' ? 'Ar' : 'En'
  const content = kind === 'test' ? <>
    {field('code')}{field(`name${suffix}`, copy.testName)}
    {field(`description${suffix}`, copy.descriptionLabel)}
    <div className="ac-pricing-row">{field('price', copy.priceILS)}{currency}{field('sampleType')}</div>
    {field(`preparation${suffix}`, copy.preparation)}
  </> : kind === 'range' ? <>
    <p className="ac-muted ac-wide">{copy.intervalsHint}</p>
    <div className="ac-range-row ac-range-applicability">{['sex', 'minAgeDays', 'maxAgeDays'].map(field)}</div>
    {parameter.valueType === 'NUMERIC' ? <div className="ac-range-row">{['lower', 'upper'].map(field)}</div> : pair(copy.referenceText, ['referenceAr', 'referenceEn'])}
    <div className="ac-range-row">{['validFrom', 'validTo'].map(field)}</div>
  </> : kind === 'parameter' ? <>
    {record?.historicallyUsed && <p className="ac-form-note">{copy.usedHint}</p>}
    {['code', 'nameAr', 'nameEn', 'valueType', 'unit', 'methodAr', 'methodEn', 'displayOrder', 'required', 'active'].map(field)}
  </> : kind === 'close' ? <><p className="ac-form-note">{copy.intervalsHint}</p>{field('validTo')}</> : <div className="ac-form-note"><strong>{catalogName(record, language)}</strong><p>{copy.deactivateHint}</p></div>
  const form = <>
    {kind !== 'test' && <div className="ac-editor-heading"><h3 id="catalog-editor-title">{title}</h3><div>{onToggleLanguage && <button type="button" className="ac-language" onClick={onToggleLanguage} lang={language === 'ar' ? 'en' : 'ar'}>{copy.switchLanguage}</button>}{modal && <button type="button" className="ac-icon" disabled={saving} aria-label={copy.close} onClick={close}><X size={19} aria-hidden="true" /></button>}</div></div>}
    <form className={`ac-form ac-form-${kind}`} onSubmit={submit} noValidate aria-label={title} aria-busy={saving}>
      {content}
      {kind === 'test' && translationAttention && <p className="ac-form-note" role="status">{copy.translationAttention}</p>}
      {errors._form && <p className="ac-error ac-wide" role="alert">{copy.errors[errors._form]}</p>}
      {failed && <p className="ac-error ac-wide" role="alert">{copy.saveError}</p>}
      {confirm && <div className="ac-form-note" role="alert"><strong>{catalogName(record, language)}</strong><p>{copy.deactivateHint}</p><button type="button" className="ac-primary" disabled={saving} onClick={event => submit(event, true)}>{copy.confirmDeactivate}</button></div>}
      <div className="ac-form-actions"><button type="button" disabled={saving} onClick={close}>{kind === 'range' ? copy.reset : copy.cancel}</button><button type="submit" className="ac-primary" disabled={saving}>{saving ? copy.saving : kind === 'deactivate' ? copy.confirmDeactivate : kind === 'range' ? copy.addRange : kind === 'test' ? copy.saveChanges : copy.save}</button></div>
    </form>
  </>
  if (!modal) return <section ref={root} className={`ac-inline-editor ac-inline-${kind}`} aria-label={title}>{form}</section>
  return <dialog ref={root} className="admin-catalog-dialog" aria-labelledby="catalog-editor-title" onCancel={event => { event.preventDefault(); close() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')], first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}>{form}</dialog>
}
