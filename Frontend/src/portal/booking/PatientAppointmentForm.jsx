import { useEffect, useState } from 'react'
import { schedulingDate, schedulingInstant, shiftDate, SCHEDULING_TIME_ZONE } from '../../admin/bookingSlots/bookingSlotsModel.js'
import { portalApi } from '../../services/portalApi.js'
import { usePortal } from '../PortalContext.js'
import { Button, Empty, Field, Title } from '../components/PortalUi.jsx'
import CalendarPicker from './components/CalendarPicker.jsx'

export default function PatientAppointmentForm({ query }) {
  const { state, t, date, language, navigate, commit, busy } = usePortal()
  const params = new URLSearchParams(query)
  const existing = state.appointments.find(item => item.id === params.get('reschedule') && item.canReschedule)
  const orders = state.orders.filter(order => order.status === 'pending' &&
    !state.appointments.some(item => item.orderId === order.id && ['confirmed', 'checked_in'].includes(item.status)))
  const [orderId, setOrderId] = useState(() => orders.find(order => order.id === params.get('order'))?.id || '')
  const [typeId, setTypeId] = useState('')
  const [types, setTypes] = useState(null)
  const [day, setDay] = useState(schedulingDate)
  const [availability, setAvailability] = useState(null)
  const [slotId, setSlotId] = useState('')
  const [typeError, setTypeError] = useState(false)
  const [requestId, setRequestId] = useState(null)
  const key = JSON.stringify([existing?.id, orderId, typeId, day])
  useEffect(() => {
    if (existing) return
    const controller = new AbortController()
    portalApi.appointmentTypes({ signal: controller.signal }).then(rows => {
      if (!controller.signal.aborted) setTypes(rows.filter(row => row.active))
    }, () => { if (!controller.signal.aborted) setTypeError(true) })
    return () => controller.abort()
  }, [existing])
  useEffect(() => {
    if (!day || (!existing && (!orderId || !typeId))) return
    const controller = new AbortController()
    const from = new Date(schedulingInstant(day, '00:00')).toISOString()
    const to = new Date(schedulingInstant(shiftDate(day, 1), '00:00')).toISOString()
    portalApi.slots({ orderId, typeId, existing: existing?.id, from, to }, { signal: controller.signal }).then(slots => {
      if (!controller.signal.aborted) setAvailability({ key, slots })
    }, () => { if (!controller.signal.aborted) setAvailability({ key, error: true }) })
    return () => controller.abort()
  }, [key, day, existing, orderId, typeId])
  const loaded = availability?.key === key ? availability : null
  const selected = loaded?.slots?.find(slot => slot.id === slotId)
  function change(update, value) { update(value); setSlotId(''); setRequestId(null) }
  async function save(event) {
    event.preventDefault()
    if (!selected || busy) return
    const key = requestId || crypto.randomUUID()
    setRequestId(key)
    const response = await commit({ type: 'APPOINTMENT', existing: existing?.id, requestId: key,
      appointment: { orderId, typeId, slotId, version: existing?.version } })
    if (response?.appointment) navigate('appointments/' + response.appointment.id)
  }
  if (params.has('reschedule') && !existing) return <Empty title="notFound" action="appointments" onClick={() => navigate('appointments')} />
  if (!existing && !orders.length) return <><Title title="bookTitle" /><Empty title="bookOrderRequired" action="orders" onClick={() => navigate('orders')} /></>
  const clock = new Intl.DateTimeFormat(language, { timeZone: SCHEDULING_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
  return <><Title title="bookTitle"><Button secondary onClick={() => navigate('appointments')}>{t('appointments')}</Button></Title>
    <section className="portal-card"><form onSubmit={save}>
      <div className="portal-book-grid"><div><CalendarPicker value={day} minimum={schedulingDate()} serverAvailability onChange={value => change(setDay, value)} />
        {!existing && <div className="portal-field-grid">
          <Field label="relatedOrder" name="appointment-order" value={orderId} onChange={event => change(setOrderId, event.target.value)} required>
            <option value="">{t('choose')}</option>{orders.map(order => <option key={order.id} value={order.id}>{order.number || '—'}</option>)}
          </Field>
          <Field label="type" name="appointment-type" value={typeId} onChange={event => change(setTypeId, event.target.value)} required>
            <option value="">{t('choose')}</option>{types?.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </Field>
        </div>}
        {(typeError || types?.length === 0) && <p role="status">{t('unavailable')}</p>}</div>
        <fieldset className="portal-slots"><legend>{t('selectTime')}</legend>
          {existing || (orderId && typeId) ? <div>{loaded?.error ? <p role="alert">{t('unavailable')}</p> :
            !loaded ? <p role="status">{t('loading')}</p> : !loaded.slots.length ? <p>{t('noSlots')}</p> :
              loaded.slots.map(slot => <button key={slot.id} type="button" value={slot.id} aria-pressed={slotId === slot.id}
                onClick={() => { setSlotId(slot.id); setRequestId(null) }}><bdi>{clock.format(new Date(slot.startsAt))}</bdi></button>)}</div> : null}
        </fieldset></div>
      <div className="portal-book-summary"><h2>{t('summary')}</h2><p>{date(day)} {selected && <bdi>{clock.format(new Date(selected.startsAt))}</bdi>}</p></div>
      <div className="portal-actions"><Button type="submit" disabled={!selected || busy}>{t(existing ? 'saveReschedule' : 'confirmAppointment')}</Button></div>
    </form></section></>
}
