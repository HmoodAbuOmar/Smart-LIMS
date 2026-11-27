import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, ClipboardList, Plus, Search, X } from 'lucide-react'
import { walkInService } from '../walk-in/walkInService.js'
import { displayPatientName } from '../patients/patientsModel.js'
import { money, testName } from '../walk-in/walkInModel.js'
import { SCHEDULING_TIME_ZONE } from '../today/todayModel.js'
import { balances, ordersRoute } from './ordersModel.js'
import { ordersCopy } from './ordersCopy.js'
import './orders.css'
import { bookableOrder } from '../appointments/appointmentsModel.js'

import Table from '../components/ReceptionistTable.jsx'
import { ReceiptDialog, RecordPaymentDialog } from '../payments/PaymentDialogs.jsx'
import { eligibleBalance, paymentAmount } from '../payments/paymentsModel.js'
import { paymentsCopy } from '../payments/paymentsCopy.js'

const tabs = ['items', 'appointment', 'payments', 'details']
export default function ReceptionistOrders({ orderId, service = walkInService }) {
  const { i18n } = useTranslation(), language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en', copy = ordersCopy[language]
  const [data, setData] = useState(null), [state, setState] = useState('loading'), [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState('items'), [search, setSearch] = useState(''), [page, setPage] = useState(0)
  const [cancelReason, setCancelReason] = useState(''), [cancelling, setCancelling] = useState(false), [cancelError, setCancelError] = useState('')
  const cancelLock = useRef(false), mounted = useRef(false)
  const [created, setCreated] = useState(() => !!orderId && window.sessionStorage.getItem('smart-lims.just-created-order') === orderId)
  const [recording, setRecording] = useState(false), [receipt, setReceipt] = useState(null), [paymentSaved, setPaymentSaved] = useState(false)
  const paymentCopy = paymentsCopy[language]
  const heading = useRef(null)
  useEffect(() => { mounted.current = true; heading.current?.focus(); return () => { mounted.current = false } }, [])
  useEffect(() => { if (created) window.sessionStorage.removeItem('smart-lims.just-created-order') }, [created])
  useEffect(() => {
    let active = true
    async function load() {
      try {
        if (orderId) {
          const order = await service.getOrder(orderId)
          if (order.id !== orderId) throw new Error('Incorrect order')
          const patient = await service.getPatient(order.patientId)
          if (patient.id !== order.patientId) throw new Error('Incorrect patient')
          if (active) setData({ order, patient })
        } else {
          const orders = await service.listAllOrders()
          const patients = await Promise.all([...new Set(orders.map(order => order.patientId))].map(id => service.getPatient(id)))
          if (active) setData({ orders, patients: new Map(patients.map(patient => [patient.id, patient])) })
        }
        if (active) setState('ready')
      } catch (error) { if (active) setState(error.code === 'ORDER_NOT_FOUND' ? 'missing' : 'error') }
    }
    void load()
    return () => { active = false }
  }, [orderId, service, attempt])
  const navigate = id => { window.location.hash = ordersRoute(id) }
  const badge = status => <span className={`ro-badge ro-${status || 'unavailable'}`}>{copy[status] || copy.unavailable}</span>
  const dateTime = order => order.createdAt ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: SCHEDULING_TIME_ZONE }).format(new Date(order.createdAt)) : order.date ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${order.date}T12:00:00Z`)) : copy.unavailable
  const birthDate = value => value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—'
  const workspace = window.location.hash.startsWith('#/__receptionist') ? '/__receptionist' : '/receptionist'
  const newOrder = () => { window.location.hash = `${workspace}/walk-in` }
  const order = data?.order, patient = data?.patient, computedBalance = order && balances(order)
  const balance = computedBalance && order.status === 'CANCELLED' ? { ...computedBalance, outstanding: 0 } : computedBalance
  async function cancelOrder(event) {
    event.preventDefault(); if (cancelLock.current) return
    if (!cancelReason.trim() || cancelReason.trim().length > 1000) { setCancelError('reasonRequired'); return }
    cancelLock.current = true; setCancelling(true); setCancelError('')
    try {
      const saved = await service.cancelOrder(order.id, cancelReason.trim())
      if (saved.id !== order.id || saved.status !== 'CANCELLED') throw new Error('Unconfirmed cancellation')
      if (mounted.current) { setState('loading'); setAttempt(value => value + 1) }
    } catch { if (mounted.current) setCancelError('cancelError') }
    finally { cancelLock.current = false; if (mounted.current) setCancelling(false) }
  }
  const matches = data?.orders?.filter(order => {
    const patient = data.patients.get(order.patientId), needle = search.trim().toLocaleLowerCase()
    return [order.orderNumber, patient.fullName, patient.nameEn, patient.nameAr].some(value => value?.toLocaleLowerCase().includes(needle))
  }).sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')) || []
  const totalPages = Math.ceil(matches.length / 8)
  return <section className="ro-orders" aria-labelledby="ro-title">
    <header className="ro-heading"><div><h1 ref={heading} tabIndex={-1} id="ro-title">{orderId ? <>{copy.workspace}{order && <> / <bdi dir="ltr">{order.orderNumber}</bdi></>}</> : copy.title}</h1><p>{copy.subtitle}</p></div>{orderId ? <button type="button" className="ro-back" onClick={() => navigate()}><ArrowLeft size={16} aria-hidden="true" />{copy.back}</button> : <button type="button" className="ro-primary" onClick={newOrder}><Plus size={16} aria-hidden="true" />{copy.newOrder}</button>}</header>
    {created && state === 'ready' && order && <div className="ro-success" role="status"><CheckCircle2 size={17} aria-hidden="true" />{copy.received}<button type="button" aria-label={copy.dismiss} onClick={() => setCreated(false)}><X size={16} aria-hidden="true" /></button></div>}
    {state !== 'ready' ? <div className="ro-card ro-empty" role={state === 'loading' ? 'status' : 'alert'} aria-busy={state === 'loading'}><ClipboardList size={25} aria-hidden="true" /><p>{copy[state]}</p>{state === 'error' && <button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button>}</div> : !orderId ? <section className="ro-card">
      <label className="ro-search"><Search size={17} aria-hidden="true" /><input type="search" value={search} aria-label={copy.search} placeholder={copy.search} onChange={event => { setSearch(event.target.value); setPage(0) }} /></label>
      {!matches.length ? <p className="ro-empty">{copy.empty}</p> : <Table numeric={[2]} columns={[copy.number, copy.patient, copy.total, copy.status, copy.created, copy.actions]} rows={matches.slice(page * 8, page * 8 + 8).map(order => [<bdi key="n">{order.orderNumber}</bdi>, displayPatientName(data.patients.get(order.patientId), language), <bdi key="a">{money(Math.round(order.totalAmount * 100), language)}</bdi>, badge(order.status), dateTime(order), <button type="button" className="ro-open" key="o" onClick={() => navigate(order.id)}>{copy.open}</button>])} />}
      <footer className="ro-pagination"><span>{copy.showing(matches.length.toLocaleString(language))}</span><div><button type="button" disabled={page === 0} onClick={() => setPage(current => current - 1)}>{copy.previous}</button><span>{(page + 1).toLocaleString(language)} / {Math.max(1, totalPages).toLocaleString(language)}</span><button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage(current => current + 1)}>{copy.next}</button></div></footer>
    </section> : <>
      <section className="ro-card ro-context"><div><h2>{displayPatientName(patient, language)}</h2><bdi>{patient.patientNumber}</bdi></div><dl>{[[copy.status, badge(order.status)], [copy.created, dateTime(order)], [copy.type, copy[order.source] || copy.unavailable], [copy.dob, birthDate(patient.dateOfBirth)], [copy.gender, copy[patient.gender] || '—'], [copy.phone, <bdi key="phone">{patient.phoneNumber || '—'}</bdi>]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
      <div className="ro-tabs" role="tablist" aria-label={copy.workspace}>{tabs.map(id => <button type="button" role="tab" key={id} id={`ro-tab-${id}`} aria-selected={tab === id} aria-controls="ro-panel" tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); const step = (event.key === 'ArrowRight' ? 1 : -1) * (language === 'ar' ? -1 : 1)
        const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(tabs.indexOf(id) + step + tabs.length) % tabs.length]
        setTab(next); document.getElementById(`ro-tab-${next}`)?.focus()
      }}>{copy[id]}</button>)}</div>
      <section className="ro-card" id="ro-panel" role="tabpanel" tabIndex={0} aria-labelledby={`ro-tab-${tab}`}>
        {tab === 'items' ? !order.items?.length ? <p className="ro-empty">{copy.itemGap}</p> : <><Table numeric={[2]} columns={[copy.code, copy.test, copy.price, copy.status]} rows={order.items.map(item => [<bdi key="c">{item.testCode}</bdi>, testName(item, language) || item.testName, <bdi key="p">{money(Math.round(item.priceAtOrder * 100), language)}</bdi>, badge(item.status)])} /><p className="ro-note">{copy.statusGap}</p></> : tab === 'appointment' ? <><div className="ro-booking-action"><button type="button" className="ro-primary ro-create-booking" disabled={!bookableOrder(order, order.appointments)} aria-describedby="ro-booking-rule" onClick={() => { window.location.hash = `${workspace}/appointments?orderId=${encodeURIComponent(order.id)}` }}>{copy.createBooking}</button>{!bookableOrder(order, order.appointments) && <p id="ro-booking-rule">{copy.bookingUnavailable}</p>}</div>{!order.appointments?.length ? <p className="ro-empty">{copy.noAppointment}</p> : <Table columns={[copy.created, copy.status]} rows={order.appointments.map(appointment => [<bdi key="d">{appointment.startsAt ? dateTime({createdAt:appointment.startsAt}) : `${appointment.date} ${appointment.time}`}</bdi>, badge(appointment.status)])} />}</> : tab === 'payments' ? <>
          <div className="ro-payment-action">
            <button type="button" className="ro-primary" disabled={!eligibleBalance(order)} onClick={() => { setPaymentSaved(false); setRecording(true) }}>{paymentCopy.record}</button>
            {!eligibleBalance(order) && <p>{paymentCopy.noneEligible}</p>}
          </div>
          {paymentSaved && <p className="ro-success" role="status">{paymentCopy.saved}</p>}
          {!order.transactions?.length ? <p className="ro-empty">{Array.isArray(order.transactions) ? copy.noPayments : copy.unavailable}</p>
            : <Table numeric={[1]} columns={[copy.type, copy.amount, copy.status, copy.actions]} rows={order.transactions.map(entry => [
              copy[entry.type] || copy.unavailable, <bdi key="amount">{paymentAmount(entry, language)}</bdi>, badge(entry.status),
              <button key="receipt" type="button" onClick={() => setReceipt({ transaction: entry, order, patient })}>{paymentCopy.view}</button>,
            ])} />}
        </> : <dl className="ro-details">{[[copy.number, order.orderNumber], [copy.type, copy[order.source] || copy.unavailable], [copy.created, dateTime(order)], [copy.notes, order.notes || '—']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {tab === 'details' && order.status === 'PENDING' && !order.appointments?.some(record => record.status === 'CHECKED_IN') && <details className="ro-cancel-order"><summary>{copy.cancelOrder}</summary><form noValidate onSubmit={event => void cancelOrder(event)}><p>{copy.cancelNotice}</p><label htmlFor="ro-cancel-reason">{copy.cancelReason} *</label><textarea id="ro-cancel-reason" required maxLength={1000} rows={2} value={cancelReason} disabled={cancelling} onChange={event => setCancelReason(event.target.value)} />{cancelError && <p role="alert">{copy[cancelError]}</p>}<button type="submit" disabled={cancelling}>{copy.cancelOrder}</button></form></details>}
      </section>
      <section className="ro-balances ro-card" aria-label={copy.payments}>{[['total', balance?.total ?? (order.totalAmount == null ? undefined : Math.round(order.totalAmount * 100))], ['paid', balance?.paid], ['outstanding', balance?.outstanding]].map(([label, amount]) => <div key={label}><span>{copy[label]}</span><strong data-balance={label}>{amount === undefined ? copy.unavailable : <bdi>{money(amount, language)}</bdi>}</strong></div>)}</section>
      {recording && <RecordPaymentDialog orders={[order]} patients={new Map([[patient.id, patient]])} initialOrderId={order.id}
        service={service} language={language} onClose={() => setRecording(false)} onSaved={transaction => {
          setData(current => ({ ...current, order: { ...current.order, transactions: [...current.order.transactions.filter(entry => entry.id !== transaction.id), transaction] } }))
          setRecording(false)
          setPaymentSaved(true)
          setReceipt({ transaction, order, patient })
        }} />}
      {receipt && <ReceiptDialog row={receipt} language={language} onClose={() => setReceipt(null)} />}
    </>}
  </section>
}
