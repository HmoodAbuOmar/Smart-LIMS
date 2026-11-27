


import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { todayDate, formatTime } from '../today/todayModel.js'
import { displayPatientName } from '../patients/patientsModel.js'

export default function AppointmentEditor({ mode, record, initialDate, initialOrderId, copy, language, service, opener, onClose, onSaved }) {
  const dialog = useRef(null), lock = useRef(false), live = useRef(false), key = useRef(null)
  const [clock, setClock] = useState(() => Date.now())
  const [date, setDate] = useState(initialDate < todayDate() ? todayDate() : initialDate), [slots, setSlots] = useState([]), [orders, setOrders] = useState([])
  const [slotId, setSlot] = useState(''), [orderId, setOrder] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0)
  const [ordersState, setOrdersState] = useState('loading'), [orderAttempt, setOrderAttempt] = useState(0)
  const initialSelectionApplied = useRef(false)
  const selectedOrder = useRef('')
  useEffect(() => { const element = dialog.current, previous = document.body.style.overflow; live.current = true; document.body.style.overflow = 'hidden'; element.showModal(); element.querySelector('input,textarea,select')?.focus(); return () => { live.current = false; element.close(); document.body.style.overflow = previous; const target = opener?.isConnected ? opener : document.querySelector('.ra-page .ra-create'); target?.focus() } }, [opener])
  const slotOrderId = mode === 'move' ? record?.orderId : orderId
  useEffect(() => {
    if (mode === 'cancel' || (mode === 'book' && !slotOrderId)) return
    let active = true
    service.slots(date, slotOrderId, mode === 'move' ? record?.id : undefined).then(slots => { if (active) { setSlots(slots); setClock(Date.now()); setLoading(false) } }, () => { if (active) { setLoading(false); setError('error') } })
    return () => { active = false }
  }, [date, mode, service, attempt, slotOrderId, record?.id])
  useEffect(() => {
    if (mode !== 'book') return
    let active = true
    service.orders().then(records => {
      if (!active) return
      setOrders(records); setOrdersState('ready')
      const current = selectedOrder.current
      let selection = records.some(order => order.id === current) ? current : ''
      if (!initialSelectionApplied.current) {
        initialSelectionApplied.current = true
        if (initialOrderId) {
          selection = records.some(order => order.id === initialOrderId) ? initialOrderId : ''
        }
      }
      if (selection !== current) key.current = null
      selectedOrder.current = selection
      setOrder(selection)
    }, () => { if (active) setOrdersState('error') })
    return () => { active = false }
  }, [mode, service, initialOrderId, attempt, orderAttempt])
  async function submit(event) {
    event.preventDefault(); if (lock.current) return
    if (mode === 'cancel' && (!reason.trim() || reason.trim().length > 1000)) { setError('reasonRequired'); dialog.current.querySelector('textarea').focus(); return }
    if (mode !== 'cancel' && (!slotId || (mode === 'book' && (ordersState !== 'ready' || !orders.some(order => order.id === orderId))))) { setError('selectRequired'); return }
    lock.current = true; setBusy(true); setError('')
    try {
      key.current ??= crypto.randomUUID()
      const saved = mode === 'cancel' ? await service.cancel(record, reason.trim()) : mode === 'move' ? await service.reschedule(record, slotId) : await service.book({ orderId, slotId, typeId: 'r07-collection', idempotencyKey: key.current })
      if (!saved?.id || (mode === 'book' && saved.orderId !== orderId) || (mode !== 'book' && saved.id !== record.id)) throw new Error('Unconfirmed appointment')
      if (live.current) onSaved(saved, mode)
    } catch (failure) { if (live.current) { setError(copy[failure.code] ? failure.code : 'saveError'); if (mode !== 'cancel') { if (mode === 'book') setOrdersState('loading'); setAttempt(value => value + 1); setLoading(true) } } }
    finally { lock.current = false; if (live.current) setBusy(false) }
  }
  const noOrders = mode === 'book' && ordersState === 'ready' && orders.length === 0
  function createOrder() {
    if (lock.current) return
    const base = window.location.hash.startsWith('#/__receptionist') ? '/__receptionist' : '/receptionist'
    window.location.hash = `${base}/walk-in?purpose=scheduled&bookingDate=${encodeURIComponent(date)}`
  }
  const title = copy[mode === 'book' ? 'create' : mode === 'move' ? 'reschedule' : 'cancel']
  const selectionValid = slots.some(slot => slot.id === slotId && slot.active && slot.remainingCapacity > 0 && Date.parse(slot.startsAt) > clock && slot.id !== record?.slotId)
  return <dialog ref={dialog} className="ra-dialog" dir={language === 'ar' ? 'rtl' : 'ltr'} aria-labelledby="ra-editor-title" onCancel={event => { event.preventDefault(); if (!lock.current) onClose() }}><form noValidate onSubmit={event => void submit(event)} aria-busy={busy}>
    <header><h2 id="ra-editor-title">{title}</h2><button type="button" aria-label={copy.close} disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    {record && <p><strong>{record.patient[language === 'ar' ? 'nameAr' : 'nameEn']}</strong> · <bdi>{record.orderNumber}</bdi></p>}
    {mode === 'cancel' ? <><label htmlFor="ra-reason">{copy.reason} *</label><textarea id="ra-reason" required maxLength={1000} rows={3} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} aria-invalid={error === 'reasonRequired'} /><p>{copy.cancelledNote}</p></> : <>
      {mode === 'book' && <><label htmlFor="ra-order">{copy.chooseOrder} *</label><select id="ra-order" value={orderId} aria-invalid={ordersState === 'error'} disabled={busy || ordersState !== 'ready' || !orders.length} onChange={event => { selectedOrder.current = event.target.value; setOrder(event.target.value); setSlot(''); setSlots([]); setLoading(true); key.current = null }}><option value="">{ordersState === 'loading' ? copy.loadingOrders : ordersState === 'error' ? copy.orderLoadError : !orders.length ? copy.noOrdersAvailable : copy.chooseOrder}</option>{orders.map(order => <option key={order.id} value={order.id}>{order.orderNumber} — {displayPatientName(order.patient, language)}</option>)}</select>{ordersState === 'error' && <button type="button" className="ra-orders-retry" disabled={busy} onClick={() => { setOrdersState('loading'); setOrderAttempt(value => value + 1) }}>{copy.retry}</button>}<label>{copy.type}<input readOnly value={copy.collection} /></label></>}
      <label htmlFor="ra-slot-date">{copy.date}</label><input id="ra-slot-date" type="date" min={todayDate()} value={date} disabled={busy} onChange={event => { setDate(event.target.value); setSlots([]); setSlot(''); key.current = null; setLoading(true) }} />
      {mode === 'book' && !orderId ? null : loading ? <p role="status">{copy.loading}</p> : <fieldset className="ra-slots"><legend>{copy.chooseSlot}</legend>{!slots.length && <p>{copy.noSlots}</p>}{slots.map(slot => {
        const unavailable = !slot.active || !slot.remainingCapacity || Date.parse(slot.startsAt) <= clock || slot.id === record?.slotId
        return <button key={slot.id} type="button" data-slot-id={slot.id} aria-pressed={slotId === slot.id} disabled={busy || unavailable} onClick={() => { setSlot(slot.id); key.current = null; setError('') }}><bdi>{formatTime(slot.startsAt, language)} – {formatTime(slot.endsAt, language)}</bdi><small>{copy.remaining}: {slot.remainingCapacity.toLocaleString(language)} / {slot.capacity.toLocaleString(language)}{!slot.remainingCapacity ? ` · ${copy.full}` : ''}</small></button>
      })}</fieldset>}
    </>}
    {error && <div className="ra-error" role="alert">{copy[error]}{mode !== 'cancel' && <button type="button" disabled={busy} onClick={() => { setAttempt(value => value + 1); setLoading(true) }}>{copy.refresh}</button>}</div>}
    <footer><button type="button" disabled={busy} onClick={onClose}>{copy.back}</button>{noOrders ? <button type="button" className="ra-primary ra-create-order" disabled={busy} onClick={createOrder}><Plus size={16} aria-hidden="true" />{copy.createOrder}</button> : <button type="submit" className="ra-primary" disabled={busy || (mode !== 'cancel' && (loading || !selectionValid || (mode === 'book' && (ordersState !== 'ready' || !orders.some(order => order.id === orderId)))))}>{busy ? copy.saving : copy[mode === 'book' ? 'save' : mode === 'move' ? 'saveMove' : 'cancel']}</button>}</footer>
  </form></dialog>
}
