import { useEffect, useRef, useState } from 'react'
import { schedulingDate, schedulingInstant, shiftDate, SCHEDULING_TIME_ZONE } from '../../admin/bookingSlots/bookingSlotsModel.js'
import { portalApi } from '../../services/portalApi.js'
import { usePortal } from '../PortalContext.js'
import { Button, Empty, Field, Title } from '../components/PortalUi.jsx'
import CalendarPicker from './components/CalendarPicker.jsx'

export default function PatientAppointmentForm({ query }) {
  const { state, t, date, language, navigate, commit, busy } = usePortal()
  const params = new URLSearchParams(query)
  const existing = state.appointments.find(item => item.id === params.get('reschedule') && item.canReschedule)
  const activeAppointments = state.appointments.filter(item => ['confirmed', 'checked_in'].includes(item.status))
  const orders = state.orders.filter(order => order.status === 'pending' &&
    !activeAppointments.some(item => item.orderId === order.id))
  const [chosenOrder, setOrderId] = useState(() => params.get('order') || '')
  const orderId = orders.find(order => order.id === chosenOrder)?.id || orders[0]?.id || ''
  const [chosenType, setTypeId] = useState('')
  const [types, setTypes] = useState(null)
  const typeId = existing?.typeId || types?.find(type => type.id === chosenType)?.id || types?.[0]?.id || ''
  const [day, setDay] = useState(() => existing?.date || schedulingDate())
  const [calendarJump, setCalendarJump] = useState(0)
  const [nextDateStatus, setNextDateStatus] = useState('')
  const nextDateRequest = useRef(null)
  const [availability, setAvailability] = useState(null)
  const [slotId, setSlotId] = useState('')
  const [typeError, setTypeError] = useState(false)
  const [typeAttempt, setTypeAttempt] = useState(0)
  const [slotAttempt, setSlotAttempt] = useState(0)
  const [rejectedOrder, setRejectedOrder] = useState('')
  const orderConflict = Boolean(!existing && orderId && orderId === rejectedOrder)
  const key = JSON.stringify([existing?.id, orderId, typeId, day, slotAttempt])
  useEffect(() => () => nextDateRequest.current?.abort(), [])
  useEffect(() => {
    if (existing) return
    const controller = new AbortController()
    portalApi.appointmentTypes({ signal: controller.signal }).then(rows => {
      if (!controller.signal.aborted) setTypes(rows.filter(row => row.active))
    }, () => { if (!controller.signal.aborted) setTypeError(true) })
    return () => controller.abort()
  }, [existing, typeAttempt])
  useEffect(() => {
    if (!day || orderConflict || (!existing && (!orderId || !typeId))) return
    const controller = new AbortController()
    const from = new Date(schedulingInstant(day, '00:00')).toISOString()
    const to = new Date(schedulingInstant(shiftDate(day, 1), '00:00')).toISOString()
    portalApi.slots({ orderId, typeId, existing: existing?.id, from, to }, { signal: controller.signal }).then(slots => {
      if (!controller.signal.aborted) setAvailability({ key, slots })
    }, error => {
      if (controller.signal.aborted) return
      if (!existing && error.status === 409 && error.code === 'ORDER_NOT_BOOKABLE') setRejectedOrder(orderId)
      else setAvailability({ key, error: true })
    })
    return () => controller.abort()
  }, [key, day, existing, orderId, typeId, orderConflict])
  const loaded = availability?.key === key ? availability : null
  const selected = loaded?.slots?.find(slot => slot.id === slotId)
  function change(update, value) {
    nextDateRequest.current?.abort()
    setNextDateStatus('')
    update(value)
    setSlotId('')
    setSlotAttempt(attempt => attempt + 1)
  }
  async function findNextDate() {
    nextDateRequest.current?.abort()
    const controller = new AbortController()
    nextDateRequest.current = controller
    setNextDateStatus('loading')
    const today = schedulingDate()
    const start = day && day >= today ? shiftDate(day, 1) : today
    const from = new Date(schedulingInstant(start, '00:00')).toISOString()
    // Thirty local days stay within the API's 31-day limit even across DST.
    const to = new Date(schedulingInstant(shiftDate(start, 30), '00:00')).toISOString()
    try {
      const slots = await portalApi.slots({ existing: existing.id, from, to }, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (!slots.length) { setNextDateStatus('empty'); return }
      change(setDay, schedulingDate(new Date(slots[0].startsAt)))
      setCalendarJump(value => value + 1)
    } catch {
      if (!controller.signal.aborted) setNextDateStatus('error')
    }
  }
  async function save(event) {
    event.preventDefault()
    if (orderConflict || !selected || busy) return
    const response = await commit({ type: 'APPOINTMENT', existing: existing?.id,
      appointment: { orderId, typeId, slotId, version: existing?.version } })
    if (response?.appointment) navigate('appointments/' + response.appointment.id)
  }
  if (params.has('reschedule') && !existing) return <Empty title="notFound" action="appointments" onClick={() => navigate('appointments')} />
  const requested = params.get('order')
  const booked = requested ? activeAppointments.find(item => item.orderId === requested) : activeAppointments.length === 1 ? activeAppointments[0] : null
  const canReschedule = booked?.canReschedule
  const clock = new Intl.DateTimeFormat(language, {
    timeZone: SCHEDULING_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', numberingSystem: 'latn',
  })
  return <><Title title={existing ? 'rescheduleTitle' : 'bookTitle'}><Button secondary onClick={() => navigate('appointments')}>{t('appointments')}</Button></Title>
    <section className="portal-card"><form onSubmit={save}>
      {existing && <p className="portal-info"><strong>{t('currentAppointment')}</strong> · {date(existing.date)} · <bdi>{clock.format(new Date(existing.startsAt))}</bdi></p>}
      <div className="portal-field-grid">
        {!existing && <Field label="bookingOrder" name="appointment-order" value={orderId} onChange={event => change(setOrderId, event.target.value)} disabled={!orders.length} required>
            {orders.length ? orders.map(order => <option key={order.id} value={order.id}>{order.number || '—'}</option>) : <option value="">{t('choose')}</option>}
          </Field>
        }
        {existing ? <div><strong>{t('type')}</strong><p>{existing.type}</p></div> : (
          <Field label="type" name="appointment-type" value={typeId} onChange={event => change(setTypeId, event.target.value)} disabled={!types?.length} required>
            {types?.length ? types.map(type => <option key={type.id} value={type.id}>{type.name}</option>) : <option value="">{t('choose')}</option>}
          </Field>
        )}
      </div>
      <div className="portal-book-grid">
        <CalendarPicker key={calendarJump} value={day} minimum={schedulingDate()} serverAvailability onChange={value => change(setDay, value)} />
        <div className="portal-book-availability">
        <fieldset className="portal-slots portal-live-slots">
          <legend>{t('selectTime')}</legend>
          {!existing && !orders.length ? <>
            <p role="status">{t(activeAppointments.length ? 'noBookableOrders' : 'bookOrderRequired')}</p>
            <Button secondary onClick={() => navigate(canReschedule ? `book?reschedule=${encodeURIComponent(booked.id)}` : activeAppointments.length ? 'appointments' : 'orders')}>
              {t(canReschedule ? 'reschedule' : activeAppointments.length ? 'appointments' : 'orders')}
            </Button>
          </> : orderConflict ? <>
            <p role="alert">{t('orderNoLongerBookable')}</p>
            <Button secondary onClick={() => navigate('appointments')}>{t('appointments')}</Button>
          </> : !existing && typeError ? <>
            <p role="alert">{t('appointmentTypesError')}</p>
            <Button secondary onClick={() => { setTypeError(false); setTypeAttempt(value => value + 1) }}>{t('retry')}</Button>
          </> : !existing && !types ? <p role="status">{t('appointmentTypesLoading')}</p>
            : !existing && !types.length ? <p role="status">{t('appointmentTypesEmpty')}</p>
            : !day || (!existing && (!orderId || !typeId)) ? <p role="status">{t('slotSelectionRequired')}</p>
            : loaded?.error ? <>
              <p role="alert">{t('slotLoadError')}</p>
              <Button secondary onClick={() => setSlotAttempt(value => value + 1)}>{t('retry')}</Button>
            </> : !loaded ? <p role="status">{t('slotsLoading')}</p>
              : !loaded.slots.length ? <p role="status">{t('noSlots')}</p>
              : <div className="portal-time-grid">{loaded.slots.map(slot => <button key={slot.id} type="button" value={slot.id} aria-pressed={slotId === slot.id}
                onClick={() => setSlotId(slot.id)}><bdi dir="ltr">{clock.format(new Date(slot.startsAt))}</bdi></button>)}</div>}
        </fieldset>
        {existing && <div>
          <Button secondary onClick={findNextDate} disabled={nextDateStatus === 'loading' || busy}>{t('nextAvailableDate')}</Button>
          {nextDateStatus === 'loading' && <p role="status">{t('slotsLoading')}</p>}
          {nextDateStatus === 'empty' && <p role="status">{t('noNextAvailableDate')}</p>}
          {nextDateStatus === 'error' && <p role="alert">{t('slotLoadError')}</p>}
        </div>}
        </div></div>
      <div className="portal-book-summary"><h2>{t('summary')}</h2><p>{date(day)} {selected && <bdi>{clock.format(new Date(selected.startsAt))}</bdi>}</p></div>
      <div className="portal-actions"><Button type="submit" disabled={orderConflict || !selected || busy}>{t(existing ? 'saveReschedule' : 'confirmAppointment')}</Button></div>
    </form></section></>
}
