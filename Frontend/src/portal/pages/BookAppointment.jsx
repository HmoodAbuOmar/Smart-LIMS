import { useEffect, useState } from 'react'
import { dateAtOffset, timeSlots, validSlot } from '../portalModel.js'
import { bookingDraftError, checkoutDraft, selectedBookingTests } from '../bookingModel.js'
import BookingSummary from '../components/BookingSummary.jsx'
import BookingDialog from '../components/BookingDialog.jsx'

export default function BookingCheckout({ api, ui, query }) {
  const { state, dispatch, t, navigate } = api
  const draft = checkoutDraft(state), relatedId = new URLSearchParams(query).get('order')
  const [error, setError] = useState(''), [dialogOpen, setDialogOpen] = useState(false)
  // A pending existing order can enter booking without duplicating its tests/order.
  useEffect(() => {
    if (relatedId && state.orders.some(order => order.id === relatedId && order.status !== 'cancelled') && draft.orderId !== relatedId) dispatch({ type: 'CHECKOUT_EDIT', patch: { orderId: relatedId } })
  }, [relatedId, state.orders, draft.orderId, dispatch])
  function update(patch) { dispatch({ type: 'CHECKOUT_EDIT', patch }); setError('') }
  function review(event) { event.preventDefault(); const error = bookingDraftError(state); setError(error || ''); if (!error) setDialogOpen(true) }
  function confirm() {
    const error = bookingDraftError(state)
    if (error) { setError(error); setDialogOpen(false); return }
    dispatch({ type: 'CHECKOUT_REVIEW', requestId: crypto.randomUUID() }); setDialogOpen(false); navigate('payment')
  }
  // A completed checkout must not be silently replayed by browser Back.
  if (draft.stage === 'complete') return <><ui.Title title="bookTitle" /><ui.Empty title="bookingConfirmation" action="viewBooking" onClick={() => navigate(`booking-confirmation/${draft.bookingId}`)} /><ui.Button secondary onClick={() => { dispatch({ type: 'CHECKOUT_NEW' }); navigate('tests') }}>{t('browse')}</ui.Button></>
  return <><ui.Title title="bookTitle" hint="bookHint"><ui.Button secondary onClick={() => navigate('appointments')}>{t('appointments')}</ui.Button></ui.Title><section className="portal-card"><p className="portal-info"><strong>{t('availability')}</strong> · {t('availabilityHint')}</p><form noValidate onSubmit={review}><div className="portal-book-grid"><div><ui.CalendarPicker value={draft.date} onChange={date => update({ date, time: '' })} /><div className="portal-field-grid"><ui.Field label="type" name="appointment-type" value={draft.type} onChange={e => update({ type: e.target.value })}><option value="collection">{t('collection')}</option><option value="consultation">{t('consultation')}</option></ui.Field></div></div><fieldset className="portal-slots"><legend>{t('selectTime')}</legend><div>{timeSlots.map(time => <button key={time} type="button" aria-pressed={draft.time === time} disabled={!validSlot(draft.date, time, state.appointments) || draft.date > dateAtOffset(180)} onClick={() => update({ time })}><bdi>{time}</bdi></button>)}</div></fieldset></div><BookingSummary api={api} ui={ui} draft={{ ...draft, tests: selectedBookingTests(state, draft) }} removable />{error && <p className="portal-error" role="alert">{t(error)}</p>}<div className="portal-actions"><ui.Button secondary onClick={() => navigate('tests')}>{t('catalogBack')}</ui.Button><ui.Button type="submit">{t('bookingContinue')}</ui.Button></div></form></section>{dialogOpen && <BookingDialog api={api} title="bookingReviewTitle" confirmLabel="bookingConfirm" cancelLabel="bookingEdit" onClose={() => setDialogOpen(false)} onConfirm={confirm}><BookingSummary api={api} ui={ui} draft={{ ...draft, tests: selectedBookingTests(state, draft) }} /></BookingDialog>}</>
}
