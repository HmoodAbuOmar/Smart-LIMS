import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, FileText, Link, Link2Off, Plus, UserRound, X } from 'lucide-react'
import { displayPatientName, linkStatus } from '../patients/patientsModel.js'
import { money } from './walkInModel.js'
import { todayCopy } from '../today/todayCopy.js'

const tabs = ['details', 'orders', 'appointments']
export default function ReceptionistPatientProfile({ patientId, service, language, copy, onCreate, created, initialTab = 'orders' }) {
  const [tab, setTab] = useState(() => tabs.includes(initialTab) ? initialTab : 'orders'), [data, setData] = useState(null), [state, setState] = useState('loading'), [attempt, setAttempt] = useState(0)
  const [showCreated, setShowCreated] = useState(!!created)
  const title = useRef(null)
  useEffect(() => { if (state === 'ready') title.current?.focus() }, [state])
  useEffect(() => { if (!created) return; const timer = setTimeout(() => setShowCreated(false), 6000); return () => clearTimeout(timer) }, [created])
  useEffect(() => {
    let active = true
    Promise.all([service.getPatient(patientId), service.listOrders(patientId), service.listAppointments(patientId)]).then(([patient, orders, appointments]) => {
      if (patient.id !== patientId || !Array.isArray(orders) || orders.some(order => order.patientId !== patientId) || !Array.isArray(appointments) || appointments.some(appointment => appointment.patientId !== patientId)) throw new Error('Invalid patient response')
      if (active) { setData({ patient, orders, appointments }); setState('ready') }
    }).catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [patientId, service, attempt])
  const patient = data?.patient, account = patient && linkStatus(patient), AccountIcon = account === 'linked' ? Link : Link2Off
  const date = value => value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—'
  const demographicFields = patient ? [['dob', date(patient.dateOfBirth)], ['gender', copy[patient.gender] || '—'], ['phone', patient.phoneNumber || '—'], ['address', patient.address || '—']] : []
  const renderDetails = fields => <dl className="r04-details">{fields.map(([label, value]) => <div key={label}><dt>{copy[label]}</dt><dd>{label === 'file' || label === 'phone' ? <bdi dir="ltr">{value}</bdi> : value}</dd></div>)}</dl>
  const createButton = <button type="button" className="r05-primary r04-create" onClick={() => onCreate(patient)}><Plus size={16} aria-hidden="true" />{copy.createLabOrder}</button>
  const name = patient ? displayPatientName(patient, language) : ''
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase(language)
  const icons = { details: UserRound, orders: FileText, appointments: CalendarDays }
  return <section className="r04-profile" aria-labelledby="r05-title" data-patient-id={patientId} aria-busy={state === 'loading'}>
    {showCreated && <div className="r04-created" role="status"><CheckCircle2 size={16} aria-hidden="true" /><span>{copy.patientCreated}</span><button type="button" aria-label={copy.dismissToast} onClick={() => { setShowCreated(false); title.current?.focus() }}><X size={15} aria-hidden="true" /></button></div>}
    {state !== 'ready' ? <div className="r05-card r05-state" role={state === 'error' ? 'alert' : 'status'}><p>{copy[state === 'error' ? 'profileError' : 'profileLoading']}</p>{state === 'error' && <button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button>}</div> : <>
      <section className="r05-card r04-summary" aria-label={copy.patient}>
        <div className="r04-identity"><span className="r04-avatar" aria-hidden="true">{initials}</span><div><h2 ref={title} tabIndex={-1}>{name}</h2><bdi>{patient.patientNumber}</bdi><span className={`r04-account r04-${account}`}><AccountIcon size={14} aria-hidden="true" />{copy[account === 'unavailable' ? 'linkUnavailable' : account]}</span></div></div>
        {renderDetails(demographicFields)}
      </section>
      <div className="r04-tabs" role="tablist" aria-label={copy.profile}>{tabs.map(id => {
        const Icon = icons[id]
        return <button type="button" role="tab" id={`r04-tab-${id}`} aria-controls="r04-content" key={id} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const step = (event.key === 'ArrowRight' ? 1 : -1) * (language === 'ar' ? -1 : 1)
          const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(tabs.indexOf(id) + step + tabs.length) % tabs.length]
          setTab(next); document.getElementById(`r04-tab-${next}`)?.focus()
        }}><Icon size={15} aria-hidden="true" />{copy[id]}</button>
      })}</div>
      <div className="r05-card" id="r04-content" role="tabpanel" tabIndex={0} aria-labelledby={`r04-tab-${tab}`}>
        {tab === 'details' ? renderDetails([['patient', name], ['file', patient.patientNumber], ...demographicFields]) : tab === 'appointments' ? !data.appointments.length ? <p className="r05-state">{copy.noAppointments}</p> : <ul className="r04-orders">{data.appointments.map(appointment => <li key={appointment.id}><bdi>{date(appointment.date)} | {appointment.time}</bdi><span>{todayCopy[language][appointment.status] || appointment.status}</span></li>)}</ul> : !data.orders.length ? <div className="r04-empty"><FileText size={26} aria-hidden="true" /><h3>{copy.noOrdersYet}</h3><p>{copy.noOrdersHint}</p>{createButton}</div> : <><div className="r04-orders-toolbar"><h2>{copy.orders}</h2>{createButton}</div><ul className="r04-orders">{data.orders.map(order => <li key={order.id}><bdi>{order.orderNumber}</bdi><span>{copy[order.status] || order.status}</span><bdi>{money(Math.round(Number(order.totalAmount) * 100), language)}</bdi></li>)}</ul></>}
      </div>
    </>}
  </section>
}
