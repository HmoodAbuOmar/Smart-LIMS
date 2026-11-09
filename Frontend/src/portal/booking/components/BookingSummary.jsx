import { Plus, Trash2 } from 'lucide-react'
import { totalPrice } from '../../portalModel.js'
import { selectedBookingTests } from '../bookingModel.js'

export default function BookingSummary({ api, draft, ui, removable = false, finalReview = false }) {
  const { state, t, date, money, local, dispatch } = api
  const ids = draft.tests || selectedBookingTests(state, draft)
  return <section className="booking-summary">{finalReview && <dl className="booking-summary-date"><dt>{t('name')}</dt><dd>{api.name || state.profile.name}</dd><dt>{t('payment')}</dt><dd>{t(draft.method)}</dd></dl>}<h2>{t('bookingSelected')}</h2>{ids.length ? <ul>{ids.map(id => { const test = state.tests.find(test => test.id === id); return <li key={id}><span>{local(test.name)}</span><strong>{money(test.price)}</strong>{removable && state.cart.includes(id) && <button type="button" className="portal-danger-icon" aria-label={`${t('remove')} ${local(test.name)}`} onClick={() => dispatch({ type: 'REMOVE', id })}><Trash2 size={16} /></button>}</li> })}</ul> : <p>{t('bookingTestsRequired')}</p>}<div className="booking-total"><strong>{t('total')}</strong><strong>{money(totalPrice(ids, state.tests))}</strong></div><dl className="booking-summary-date"><dt>{t('selectedDate')}</dt><dd>{draft.date ? date(draft.date) : '—'}</dd><dt>{t('bookingTime')}</dt><dd><bdi>{draft.time || '—'}</bdi></dd></dl>{removable && <ui.Button secondary onClick={() => api.navigate('tests')}><Plus size={15} />{t('addMore')}</ui.Button>}</section>
}
