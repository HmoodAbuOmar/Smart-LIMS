import ReceptionistPatientProfile from './ReceptionistPatientProfile.jsx'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, CheckCircle2, ClipboardList, Plus, Search, Trash2 } from 'lucide-react'
import ReceptionistPatients from '../patients/ReceptionistPatients.jsx'
import { displayPatientName } from '../patients/patientsModel.js'
import { walkInCopy } from './walkInCopy.js'
import { money, reconcileTests, testMatches, testName, totalCents, validTest, validateSelection } from './walkInModel.js'
import { walkInService } from './walkInService.js'
import './walkIn.css'

export default function ReceptionistWalkIn({ service = walkInService, initialPatientId = null, initialTab = 'orders', fromPatients = false }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en', copy = walkInCopy[language]
  const [patient, setPatient] = useState(() => initialPatientId ? { id: initialPatientId } : null), [stage, setStage] = useState(initialPatientId ? 'profile' : 'search')
  const choosingPatient = stage === 'search'
  const [patientCreated, setPatientCreated] = useState(false)
  const [profileTab, setProfileTab] = useState(initialTab)
  const [tests, setTests] = useState([]), [selected, setSelected] = useState([])
  const [search, setSearch] = useState(''), [notes, setNotes] = useState('')
  const [state, setState] = useState('loading'), [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false), [message, setMessage] = useState(null), [order, setOrder] = useState(null)
  const lock = useRef(false), live = useRef(false), key = useRef(null), heading = useRef(null), testsHeading = useRef(null)
  useEffect(() => { live.current = true; heading.current?.focus(); return () => { live.current = false } }, [])
  useEffect(() => {
    let active = true
    service.listTests().then(records => { if (active) { setTests(records); setState('ready') } }, () => { if (active) setState('error') })
    return () => { active = false }
  }, [service, attempt])
  function changed() { key.current = null; setMessage(null) }
  function selectPatient(record, created = false) { changed(); if (record.id !== patient?.id) { setSelected([]); setNotes('') } setPatient(record); setPatientCreated(created); setStage('profile') }
  function startOrder(record) { setPatient(record); setStage('order'); requestAnimationFrame(() => testsHeading.current?.focus()) }
  function toggleTest(test) {
    if (lock.current) return
    changed()
    setSelected(current => current.some(item => item.id === test.id) ? current.filter(item => item.id !== test.id) : validTest(test) ? [...current, test] : current)
  }
  async function confirm(event) {
    event.preventDefault()
    if (lock.current) return
    const error = validateSelection(patient, selected)
    if (error) { setMessage(error); return }
    lock.current = true; setSaving(true); setMessage(null)
    try {
      const fresh = await service.listTests()
      if (!live.current) return
      setTests(fresh)
      const checked = reconcileTests(selected, fresh)
      if (checked.unavailable.length || checked.changed.length) {
        setSelected(checked.tests); key.current = null
        setMessage(checked.unavailable.length ? 'testUnavailable' : 'pricesChanged'); return
      }
      key.current ??= crypto.randomUUID()
      const saved = await service.create({ patientId: patient.id, testIds: selected.map(test => test.id), source: 'WALK_IN', notes, quotedTests: selected, idempotencyKey: key.current })
      if (!saved?.id || !saved.orderNumber || saved.patientId !== patient.id || !Array.isArray(saved.items) || !Number.isFinite(Number(saved.totalAmount))) throw new Error('Unconfirmed order response')
      if (live.current) { setOrder(saved); requestAnimationFrame(() => heading.current?.focus()) }
    } catch (failure) {
      if (live.current) {
        setMessage(['testUnavailable', 'pricesChanged', 'ORDER_TEST_UNAVAILABLE'].includes(failure.code) ? failure.code === 'ORDER_TEST_UNAVAILABLE' ? 'testUnavailable' : failure.code : 'saveError')
      }
    } finally { lock.current = false; if (live.current) setSaving(false) }
  }
  function back() { if (!lock.current) { window.location.hash = `${window.location.hash.startsWith('#/__receptionist') ? '/__receptionist' : '/receptionist'}/${fromPatients ? 'patients' : 'today'}`; requestAnimationFrame(() => document.querySelector(fromPatients ? '#r02-search' : '.r01-walk-in')?.focus()) } }
  return <section className={`r05-walk-in${order ? ' r05-confirmation' : ''}`} aria-labelledby="r05-title">
    <header className={`r05-heading${order ? ' r05-success-heading' : stage === 'profile' ? ' r04-heading' : ''}`}><div><h1 id="r05-title" ref={heading} tabIndex={-1}>{order ? <><CheckCircle2 size={19} className="r05-success-icon" aria-hidden="true" />{copy.created}</> : stage === 'profile' ? copy.profile : choosingPatient ? copy.selectPatient : copy.title}</h1>{!order && <p>{stage === 'profile' ? copy.profileSubtitle : copy.subtitle}</p>}</div><button type="button" disabled={saving} className="r05-back" onClick={order ? () => { window.location.hash = window.location.hash.startsWith('#/__receptionist') ? '/__receptionist/today' : '/receptionist/today' } : stage === 'profile' && !fromPatients ? () => { setPatientCreated(false); setStage('search'); requestAnimationFrame(() => document.querySelector('#r02-search')?.focus()) } : back}><ArrowLeft size={16} aria-hidden="true" />{order ? copy.back : fromPatients ? copy.backPatients : stage === 'profile' ? copy.backSearch : copy.back}</button></header>
    {order ? <section className="r05-card r05-receipt" aria-labelledby="r05-summary-title">
      <h2 id="r05-summary-title">{copy.orderSummary}</h2>
      <dl className="r05-receipt-context"><div><dt>{copy.orderNumber}</dt><dd><bdi>{order.orderNumber}</bdi></dd></div><div><dt>{copy.patient}</dt><dd>{displayPatientName(patient, language)}</dd></div><div><dt>{copy.file}</dt><dd><bdi>{patient.patientNumber}</bdi></dd></div></dl>
      <ul>{order.items.map(item => <li key={item.labTestId}><span>{testName(item, language) || item.testName}</span><bdi>{money(Math.round(Number(item.priceAtOrder) * 100), language)}</bdi></li>)}</ul>
      <p className="r05-total">{copy.total}<bdi>{money(Math.round(Number(order.totalAmount) * 100), language)}</bdi></p>
      {order.notes && <p>{copy.notes}: {order.notes}</p>}
      <footer className="r05-receipt-actions"><button type="button" className="r05-primary r05-back-profile" onClick={() => { setOrder(null); setSelected([]); setNotes(''); changed(); setPatientCreated(false); setProfileTab('orders'); setStage('profile') }}>{copy.backProfile}</button>
      <button type="button" className="r05-new-order" onClick={() => { setOrder(null); setPatient(null); setStage('search'); setSelected([]); setNotes(''); changed() }}>{copy.newOrder}</button></footer>
    </section> : <>
      {choosingPatient ? <ReceptionistPatients onSelect={selectPatient} selectedPatientId={patient?.id} selectionLabel={copy.selectPatient} selectedLabel={copy.selected} onCreated={record => selectPatient(record, true)} addHint={copy.addHint} /> : stage === 'profile' ? <ReceptionistPatientProfile key={patient.id} patientId={patient.id} initialTab={profileTab} service={service} language={language} copy={copy} created={patientCreated} onCreate={startOrder} /> : <section className="r05-card r05-patient" aria-label={copy.patient}><div><small>{copy.patient}</small><strong>{displayPatientName(patient, language)}</strong><bdi>{patient.patientNumber}</bdi></div><button type="button" disabled={saving} onClick={() => setStage('search')}>{copy.changePatient}</button></section>}
      {stage === 'order' && <><button type="button" className="r05-back-profile" disabled={saving} onClick={() => { setPatientCreated(false); setStage('profile') }}>{copy.backProfile}</button><div className="r05-workspace"><section className="r05-card r05-test-panel" aria-labelledby="r05-tests-title">
        <h2 ref={testsHeading} tabIndex={-1} id="r05-tests-title">{copy.tests}</h2>
        <label className="r05-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label={copy.searchTests} placeholder={copy.searchTests} value={search} maxLength={150} onChange={event => setSearch(event.target.value)} /></label>
        {state === 'ready' && <div className="r05-test-columns" aria-hidden="true"><span>{copy.tests}</span><span>{copy.price}</span><span>{copy.actions}</span></div>}
        {state !== 'ready' ? <div className="r05-state" role={state === 'error' ? 'alert' : 'status'}><p>{copy[state === 'error' ? 'loadError' : 'loading']}</p>{state === 'error' && <button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button>}</div> : <ul className="r05-test-list">{tests.filter(test => testMatches(test, search)).map(test => {
          const added = selected.some(item => item.id === test.id)
          return <li key={test.id} data-test-id={test.id} className={added ? 'r05-test-selected' : undefined}><div><bdi>{test.code}</bdi><strong>{testName(test, language)}</strong>{!test.active && <small>{copy.inactive}</small>}</div><bdi>{money(test.priceCents, language)}</bdi><button type="button" disabled={saving || added || !validTest(test) || selected.length >= 100} onClick={() => toggleTest(test)} aria-label={`${added ? copy.added : copy.add}: ${testName(test, language)}`}>{added ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{added ? copy.added : copy.add}</button></li>
        })}{!tests.some(test => testMatches(test, search)) && <li className="r05-state">{copy.noTests}</li>}</ul>}
      </section>
      <form className="r05-card r05-summary" onSubmit={event => void confirm(event)} aria-busy={saving} noValidate>
        <h2><ClipboardList size={18} aria-hidden="true" />{copy.summary}</h2><small>{copy.selectedCount(selected.length.toLocaleString(language))}</small>
        {!selected.length ? <p>{copy.emptySelection}</p> : <ul>{selected.map(test => <li key={test.id}><div><strong>{testName(test, language)}</strong><bdi>{money(test.priceCents, language)}</bdi>{!validTest(test) && <small>{copy.inactive}</small>}</div><button type="button" className="r05-remove" disabled={saving} aria-label={`${copy.remove}: ${testName(test, language)}`} onClick={() => toggleTest(test)}><Trash2 size={16} aria-hidden="true" /></button></li>)}</ul>}
        <p className="r05-total">{copy.total}<bdi>{money(totalCents(selected), language)}</bdi></p>
        <label htmlFor="r05-notes">{copy.notes}</label><textarea id="r05-notes" rows={3} value={notes} disabled={saving} aria-describedby="r05-notes-hint" onChange={event => { changed(); setNotes(event.target.value) }} /><small id="r05-notes-hint">{copy.notesHint}</small>
        <p>{copy.noSlot}</p>{message && <p className="r05-error" role="alert">{copy[message]}</p>}
        {choosingPatient && <small>{copy.choosePatient}</small>}
        <button type="submit" className="r05-primary" disabled={saving || choosingPatient}>{saving ? copy.saving : copy.confirm}</button>
      </form></div></>}
    </>}
  </section>
}
