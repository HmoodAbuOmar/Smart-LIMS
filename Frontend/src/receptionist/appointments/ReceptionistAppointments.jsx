import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, RefreshCw, X } from 'lucide-react'
import { formatTime, localName, todayDate } from '../today/todayModel.js'
import { ordersRoute } from '../orders/ordersModel.js'
import { canArrive, canCancel, canMove, validDate } from './appointmentsModel.js'
import { appointmentsService } from './appointmentsService.js'
import { appointmentsCopy } from './appointmentsCopy.js'
import AppointmentEditor from './AppointmentEditor.jsx'
import './appointments.css'

const statuses = ['BOOKED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW']
export default function ReceptionistAppointments({ service = appointmentsService, initialOrderId = null, initialDate = null, openBooking = false }) {
  const { i18n } = useTranslation(), language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en', copy = appointmentsCopy[language]
  const [date, setDate] = useState(() => validDate(initialDate) ? initialDate : todayDate()), [status, setStatus] = useState('all'), [records, setRecords] = useState([])
  const [state, setState] = useState('loading'), [attempt, setAttempt] = useState(0), [editor, setEditor] = useState(() => initialOrderId || openBooking ? { mode: 'book', initialOrderId } : null), [pending, setPending] = useState(null), [toast, setToast] = useState(null)
  const live = useRef(false), lock = useRef(false), title = useRef(null)
  useEffect(() => { live.current = true; title.current?.focus(); return () => { live.current = false } }, [])
  useEffect(() => {
    let active = true
    if (!validDate(date)) return
    service.load(date).then(records => { if (active) { setRecords(records); setState('ready') } }, () => { if (active) setState('error') })
    return () => { active = false }
  }, [date, attempt, service])
  const refresh = () => { setState('loading'); setAttempt(value => value + 1) }
  async function arrive(record) {
    if (lock.current) return
    lock.current = true; setPending(record.id); setToast(null)
    try { const saved = await service.checkIn(record); if (saved.id !== record.id || saved.status !== 'CHECKED_IN') throw new Error('Unconfirmed check-in'); if (live.current) { setToast({ key: 'arrived' }); refresh() } }
    catch (error) { if (live.current) setToast({ key: copy[error.code] ? error.code : 'saveError', error: true }) }
    finally { lock.current = false; if (live.current) setPending(null) }
  }
  const rows = records.filter(record => status === 'all' || record.status === status), columns = ['slot', 'capacity', 'patient', 'order', 'status', 'actions']
  return <section className="ra-page" aria-labelledby="ra-title">
    <header className="ra-heading"><div><h1 id="ra-title" ref={title} tabIndex={-1}>{copy.title}</h1><p>{copy.subtitle}</p></div><button type="button" className="ra-primary ra-create" disabled={!!pending} onClick={event => setEditor({ mode: 'book', opener: event.currentTarget })}><Plus size={16} aria-hidden="true" />{copy.create}</button></header>
    {toast && <div className={`ra-toast${toast.error ? ' ra-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{copy[toast.key]}<button type="button" aria-label={copy.close} onClick={() => setToast(null)}><X size={16} aria-hidden="true" /></button></div>}
    <section className="ra-card"><div className="ra-toolbar"><label htmlFor="ra-day">{copy.date}<input id="ra-day" type="date" value={date} onChange={event => { setDate(event.target.value); setState(validDate(event.target.value) ? 'loading' : 'error') }} /></label><label htmlFor="ra-status">{copy.status}<select id="ra-status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">{copy.all}</option>{statuses.map(value => <option value={value} key={value}>{copy[value]}</option>)}</select></label><button type="button" disabled={!!pending || state === 'loading' || !validDate(date)} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />{copy.refresh}</button></div>
      {state !== 'ready' ? <div className="ra-state" role={state === 'loading' ? 'status' : 'alert'} aria-busy={state === 'loading'}><CalendarDays size={24} aria-hidden="true" /><p>{copy[state === 'loading' ? 'loading' : 'error']}</p>{state === 'error' && validDate(date) && <button type="button" onClick={refresh}>{copy.retry}</button>}</div> : !rows.length ? <div className="ra-state"><CalendarDays size={24} aria-hidden="true" /><p>{copy.empty}</p></div> : <div className="ra-table"><table><thead><tr>{columns.map(column => <th key={column} scope="col">{copy[column]}</th>)}</tr></thead><tbody>{rows.map(record => <tr key={record.id} data-appointment-id={record.id}>
        {[<bdi key="slot">{formatTime(record.startsAt, language)} – {formatTime(record.endsAt, language)}</bdi>, <bdi key="count">{record.booked.toLocaleString(language)} / {record.capacity.toLocaleString(language)}</bdi>, <div key="patient">{localName(record.patient, language)}<small><bdi>{record.patient.fileNumber}</bdi></small></div>, record.orderId ? <button type="button" key="order" className="ra-order" onClick={() => { window.location.hash = ordersRoute(record.orderId) }}>{record.orderNumber || record.orderId}</button> : '—', <span key="status" className={`ra-badge ra-${record.status}`}>{copy[record.status]}</span>, <div className="ra-actions" key="actions">{canArrive(record) && <button type="button" className="ra-primary ra-arrive" disabled={!!pending} onClick={() => void arrive(record)}>{copy.checkIn}</button>}{canMove(record) && <button type="button" className="ra-move" disabled={!!pending} onClick={event => setEditor({ mode: 'move', record, opener: event.currentTarget })}>{copy.reschedule}</button>}{canCancel(record) && <button type="button" className="ra-cancel" disabled={!!pending} onClick={event => setEditor({ mode: 'cancel', record, opener: event.currentTarget })}>{copy.cancel}</button>}{!canArrive(record) && !canMove(record) && !canCancel(record) && '—'}</div>].map((value, index) => <td key={columns[index]}><span className="ra-mobile-label" aria-hidden="true">{copy[columns[index]]}</span>{value}</td>)}
      </tr>)}</tbody></table></div>}
    </section>
    {editor && <AppointmentEditor {...editor} initialDate={date} service={service} copy={copy} language={language} onClose={() => setEditor(null)} onSaved={(saved, mode) => { setEditor(null); setToast({ key: mode === 'book' ? 'booked' : mode === 'move' ? 'moved' : 'cancelled' }); if (mode !== 'cancel') setDate(todayDate(new Date(saved.startsAt))); refresh() }} />}
  </section>
}
