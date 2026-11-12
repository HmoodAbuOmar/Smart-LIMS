import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Plus, X, RotateCcw, Clock, Info, Ellipsis } from 'lucide-react'
import { Button } from '../../portal/components/PortalUi.jsx'
import { todayCopy } from './todayCopy.js'
import { todayService } from './todayService.js'
import { arrivalCounts, canCheckIn, canMarkNoShow, dayAppointments, filterArrivals, formatTime, localName, SCHEDULING_TIME_ZONE, todayDate } from './todayModel.js'
import './today.css'

const tabs = ['arrivals', 'checkedIn', 'notArrived']
function ActionDialog({ state, copy, language, pending, onClose, onConfirm }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close(); document.body.style.overflow = overflow
      const target = state.opener?.isConnected ? state.opener : document.querySelector('.r01-tabs [aria-selected=true]')
      target?.focus()
    }
  }, [state])
  const confirmation = state.kind === 'noShow'
  return <dialog ref={dialog} className="r01-dialog" aria-labelledby="r01-dialog-title" onCancel={event => { event.preventDefault(); if (!pending) onClose() }}>
    <header><h3 id="r01-dialog-title">{confirmation ? copy.noShowTitle : copy.unavailableTitle}</h3><button type="button" autoFocus disabled={pending} aria-label={copy.close} onClick={onClose}><X size={18} /></button></header>
    {state.appointment && <p><strong>{localName(state.appointment.patient, language)}</strong><br /><bdi>{state.appointment.orderNumber || state.appointment.patient.fileNumber}</bdi></p>}
    <p>{confirmation ? copy.noShowReason : copy[`${state.kind}Unavailable`]}</p>
    <footer>{confirmation ? <><button type="button" disabled={pending} onClick={onClose}>{copy.cancel}</button><button type="button" className="r01-primary" disabled={pending} onClick={() => onConfirm(state.appointment)}>{pending ? copy.markingNoShow : copy.confirm}</button></> : <button type="button" onClick={onClose}>{copy.close}</button>}</footer>
  </dialog>
}
export default function ReceptionistToday({ service = todayService }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = todayCopy[language]
  const [now, setNow] = useState(() => new Date())
  const [appointments, setAppointments] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState('arrivals')
  const [pending, setPending] = useState(null)
  const [toast, setToast] = useState(null)
  const [dialog, setDialog] = useState(null)
  const writing = useRef(false)
  const mounted = useRef(false)
  const date = todayDate(now)
  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [])
  useEffect(() => {
    let live = true
    service.load().then(records => { if (live) { setAppointments(records); setStatus('ready') } }, error => { if (live) setStatus(error.code === 'RECEPTIONIST_UNAVAILABLE' ? 'unavailable' : 'error') })
    return () => { live = false }
  }, [service, attempt, date])
  const all = dayAppointments(appointments, date)
  const counts = arrivalCounts(all)
  const rows = filterArrivals(all, tab)
  const columns = ['time', 'file', 'patient', 'order', 'status', 'actions']
  async function act(appointment, action) {
    if (writing.current) return
    writing.current = true; setPending({ id: appointment.id, action }); setToast(null)
    try {
      const saved = await service[action](appointment.id, appointment.version)
      if (!mounted.current) return
      const restoreRowFocus = document.activeElement?.closest('tr')?.dataset.appointmentId === appointment.id
      setAppointments(current => current.map(record => record.id === saved.id ? saved : record))
      setToast({ key: action === 'checkIn' ? 'checkedInSuccess' : 'noShowSuccess', patient: saved.patient, error: false })
      setDialog(null)
      if (restoreRowFocus) requestAnimationFrame(() => {
        const row = document.querySelector(`[data-appointment-id="${saved.id}"]`)
        const target = row?.querySelector('.r01-order-link') || document.querySelector('.r01-tabs [aria-selected=true]')
        target?.focus()
      })
    } catch (error) {
      if (mounted.current) setToast({ key: error.code === 'APPOINTMENT_CHANGED' ? 'changed' : action === 'checkIn' ? 'checkInError' : 'noShowError', patient: appointment.patient, error: true })
    } finally {
      writing.current = false
      if (mounted.current) setPending(null)
    }
  }
  function open(kind, opener, appointment) { opener.closest('details')?.removeAttribute('open'); setDialog({ kind, opener, appointment }) }
  function refresh() { if (writing.current) return; setStatus('loading'); setAttempt(value => value + 1) }
  return <>
      <div className="r01-heading"><div><h1>{copy.today}</h1><p>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { timeZone: SCHEDULING_TIME_ZONE, weekday: 'long', dateStyle: undefined, year: 'numeric', month: 'long', day: 'numeric' }).format(now)} <small>({copy.timezone})</small></p></div><Button className="portal-button r01-primary r01-walk-in" onClick={() => { window.location.hash = window.location.hash.startsWith('#/__receptionist') ? '/__receptionist/walk-in' : '/receptionist/walk-in' }}><Plus size={16} aria-hidden="true" />{copy.walkIn}</Button></div>
      {toast && <div className={`r01-toast${toast.error ? ' r01-toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{copy[toast.key]} — {localName(toast.patient, language)}<button type="button" aria-label={copy.close} onClick={() => setToast(null)}><X size={16} /></button></div>}
      <section className="r01-panel" aria-busy={status === 'loading'}>
        <div className="r01-toolbar"><div className="r01-tabs" role="tablist" aria-label={copy.today}>{tabs.map(key => <button type="button" role="tab" key={key} id={`r01-tab-${key}`} aria-controls="r01-bookings" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const step = (event.key === 'ArrowRight' ? 1 : -1) * (language === 'ar' ? -1 : 1)
          const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(tabs.indexOf(key) + step + tabs.length) % tabs.length]
          setTab(next); document.getElementById(`r01-tab-${next}`).focus()
        }}>{copy[key]}<span>({status === 'ready' ? counts[key].toLocaleString(language) : '—'})</span></button>)}</div><Button secondary className="portal-button r01-refresh" disabled={!!pending || status === 'loading'} onClick={refresh}><RotateCcw size={16} aria-hidden="true" />{copy.refresh}</Button></div>
        <div id="r01-bookings" role="tabpanel" aria-labelledby={`r01-tab-${tab}`} tabIndex={0}>
          {status !== 'ready' ? <div className="r01-state" role={status === 'loading' ? 'status' : 'alert'}><CalendarDays size={25} aria-hidden="true" /><p>{copy[status]}</p>{status === 'error' && <button type="button" onClick={refresh}>{copy.retry}</button>}</div> : rows.length === 0 ? <div className="r01-state" role="status"><CalendarDays size={25} aria-hidden="true" /><p>{!all.length ? copy.empty : tab === 'checkedIn' ? copy.noCheckedIn : copy.noNotArrived}</p></div> : <div className="r01-table-container"><table role="table"><thead role="rowgroup"><tr role="row">{columns.map(key => <th scope="col" key={key} role="columnheader">{copy[key]}</th>)}</tr></thead><tbody role="rowgroup">{rows.map(appointment => <tr role="row" key={appointment.id} data-appointment-id={appointment.id}>
            {[<bdi key="time">{formatTime(appointment.startsAt, language)}</bdi>, <bdi key="file">{appointment.patient.fileNumber}</bdi>, localName(appointment.patient, language), appointment.orderNumber ? <button type="button" key="order" className="r01-order-link" onClick={event => open('order', event.currentTarget, appointment)}><bdi>{appointment.orderNumber}</bdi></button> : '—', <div key="status" className="r01-status"><span className={`r01-badge r01-${appointment.status}`}><span className="r01-status-dot" aria-hidden="true" />{copy[appointment.status]}</span>{appointment.arrivedAt && <small className="r01-arrival-time"><span className="r01-sr-only">{copy.arrival}: </span><bdi>{formatTime(appointment.arrivedAt, language)}</bdi></small>}</div>, <div key="actions" className="r01-actions">
              <Button className="portal-button r01-primary r01-check-in" disabled={!canCheckIn(appointment) || !!pending} aria-busy={pending?.id === appointment.id && pending.action === 'checkIn'} aria-label={pending?.id === appointment.id && pending.action === 'checkIn' ? copy.checkingIn : undefined} title={!canCheckIn(appointment) ? appointment.status === 'BOOKED' ? copy.ineligible : copy[appointment.status] : undefined} onClick={() => void act(appointment, 'checkIn')}>{copy.checkIn}</Button>
              {appointment.status === 'BOOKED' && <details className="r01-more" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus() } }}><summary aria-label={`${copy.actions}: ${localName(appointment.patient, language)}`} aria-disabled={!!pending} onClick={event => { if (pending) event.preventDefault() }}><Ellipsis size={16} aria-hidden="true" /></summary><div className="r01-action-menu">
              {appointment.status === 'BOOKED' && !canCheckIn(appointment) && <span className="r01-ineligible"><Info size={14} aria-hidden="true" />{copy.ineligible}</span>}
              {appointment.status === 'BOOKED' && <button type="button" disabled={!!pending} className="r01-reschedule" onClick={event => open('reschedule', event.currentTarget, appointment)}>{copy.reschedule}</button>}
              {canMarkNoShow(appointment, now) && <button type="button" disabled={!!pending} className="r01-no-show" onClick={event => open('noShow', event.currentTarget, appointment)}><Clock size={14} aria-hidden="true" />{copy.markNoShow}</button>}
              </div></details>}
            </div>].map((value, index) => <td role="cell" key={columns[index]}><span className="r01-mobile-label" aria-hidden="true">{copy[columns[index]]}</span><div>{value}</div></td>)}
          </tr>)}</tbody></table></div>}
        </div>
        {status === 'ready' && <footer className="r01-footer">{rows.length.toLocaleString(language)} {copy.resultCount}</footer>}
      </section>
    {dialog && <ActionDialog state={dialog} copy={copy} language={language} pending={!!pending} onClose={() => setDialog(null)} onConfirm={appointment => void act(appointment, 'markNoShow')} />}
  </>
}
