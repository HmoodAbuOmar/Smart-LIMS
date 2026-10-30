import { useState } from 'react'
import { dateAtOffset, timeSlots, validSlot } from '../portalModel.js'
import CalendarPicker from '../components/CalendarPicker.jsx'
import { Title, Button, Empty, Field } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Booking({ query }) {
  const { state, t, commit, navigate, setNotice, busy, date } = usePortal()
  const params = new URLSearchParams(query), existing = state.appointments.find(a => a.id === params.get('reschedule') && a.status === 'confirmed' && new Date(`${a.date}T${a.time}`) > new Date())
  const [draft, setDraft] = useState({ date: existing?.date || dateAtOffset(1), time: existing?.time || '', type: existing?.type || 'collection', orderId: existing?.orderId || (state.orders.some(o => o.id === params.get('order') && o.status !== 'cancelled') ? params.get('order') : '') }), [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (!validSlot(draft.date, draft.time, state.appointments, existing?.id) || !['collection', 'consultation'].includes(draft.type) || (draft.orderId && !state.orders.some(o => o.id === draft.orderId && o.status !== 'cancelled'))) { setError('invalidSlot'); return }
    const appointment = { ...existing, ...draft, id: existing?.id || `SAMPLE-A${crypto.randomUUID().slice(0, 8)}`, status: 'confirmed' }
    if (await commit({ type: 'APPOINTMENT', existing: existing?.id, appointment })) { navigate('appointments'); setNotice('appointmentSaved') }
  }
  if (params.has('reschedule') && !existing) return <Empty title="notFound" action="appointments" onClick={() => navigate('appointments')} />
  return <><Title title="bookTitle" hint="bookHint"><Button secondary onClick={() => navigate('appointments')}>{t('appointments')}</Button></Title><section className="portal-card"><p className="portal-info"><strong>{t('availability')}</strong> · {t('availabilityHint')}</p><form noValidate onSubmit={submit}><div className="portal-book-grid"><div><CalendarPicker value={draft.date} onChange={value => { setDraft({ ...draft, date: value, time: '' }); setError('') }} /><div className="portal-field-grid"><Field label="type" name="appointment-type" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="collection">{t('collection')}</option><option value="consultation">{t('consultation')}</option></Field><Field label="relatedOrder" name="appointment-order" disabled={!!existing?.tests?.length} value={draft.orderId} onChange={e => setDraft({ ...draft, orderId: e.target.value })}><option value="">{t('none')}</option>{state.orders.filter(o => o.status !== 'cancelled').map(o => <option key={o.id} value={o.id}>{o.id}</option>)}</Field></div></div><fieldset className="portal-slots"><legend>{t('selectTime')}</legend><div>{timeSlots.map(time => <button key={time} type="button" aria-pressed={draft.time === time} disabled={!validSlot(draft.date, time, state.appointments, existing?.id) || draft.date > dateAtOffset(180)} onClick={() => { setDraft({ ...draft, time }); setError('') }}><bdi>{time}</bdi></button>)}</div></fieldset></div><div className="portal-book-summary"><h2>{t('summary')}</h2><p>{draft.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? date(draft.date) : t('choose')} · <bdi>{draft.time || '—'}</bdi> · {t(draft.type)}</p></div>{error && <p className="portal-error" role="alert">{t(error)}</p>}<div className="portal-actions"><Button secondary onClick={() => navigate('appointments')}>{t('back')}</Button><Button type="submit" disabled={busy}>{t(busy ? 'saving' : existing ? 'saveReschedule' : 'confirmAppointment')}</Button></div></form></section></>
}
