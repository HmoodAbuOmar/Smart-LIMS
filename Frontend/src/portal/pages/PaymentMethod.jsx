import { useRef, useState } from 'react'
import { totalPrice } from '../portalModel.js'
import BookingReceipt from './BookingConfirmation.jsx'
import { bookingDraftError, checkoutDraft } from '../bookingModel.js'
import { Building2, CreditCard } from 'lucide-react'
import HostedCardForm from '../HostedCardForm.jsx'
import { validReceiptEmail } from '../../services/hostedPayment.js'
import BookingSummary from '../components/BookingSummary.jsx'
import BookingDialog from '../components/BookingDialog.jsx'

export default function PaymentMethod({ api, ui }) {
  const { state, t, dispatch, navigate, busy, finishBooking } = api
  const draft = checkoutDraft(state)
  const [dialogOpen, setDialogOpen] = useState(false), [error, setError] = useState('')
  const submitLock = useRef(false)
  const hostedFields = useRef(null), reviewLock = useRef(false)
  const [receiptEmail, setReceiptEmail] = useState(state.profile.email || '')
  const [emailError, setEmailError] = useState(false), [checkingCard, setCheckingCard] = useState(false)
  if (draft.stage === 'complete') return <BookingReceipt api={api} ui={ui} id={draft.bookingId} />
  if (draft.stage === 'pending') return <BookingReceipt api={api} ui={ui} id="pending" />
  if (!['reviewed', 'processing'].includes(draft.stage) || !draft.tests?.length) return <><ui.Title title="payment" /><ui.Empty title="bookingNoDraft" action="book" onClick={() => navigate('book')} /></>
  async function openDialog() {
    if (reviewLock.current || busy) return
    if (!draft.method) { setError('paymentChoose'); return }
    const invalid = bookingDraftError(state)
    if (invalid) { setError(invalid); return }
    setError('')
    if (draft.method === 'online') {
      if (!validReceiptEmail(receiptEmail)) { setEmailError(true); return }
      reviewLock.current = true; setCheckingCard(true)
      try {
        const problem = await hostedFields.current?.validate() || (!hostedFields.current ? 'cardUnavailable' : null)
        if (problem) { setError(problem); return }
      } catch { setError('cardUnavailable'); return }
      finally { reviewLock.current = false; setCheckingCard(false) }
    }
    setDialogOpen(true)
  }
  async function submit() {
    if (submitLock.current) return
    if (draft.method === 'online' && !validReceiptEmail(receiptEmail)) { setEmailError(true); setDialogOpen(false); return }
    submitLock.current = true
    try {
      const result = await finishBooking(draft.method === 'online' ? { receiptEmail: receiptEmail.trim(), confirmCard: session => hostedFields.current.confirm(session) } : undefined)
      setDialogOpen(false)
      if (result.ok) navigate(`booking-confirmation/${result.bookingId}`)
      else if (result.pending) navigate('booking-confirmation/pending')
      else setError(result.error)
    } catch { setDialogOpen(false); setError('bookingUnavailable') }
    finally { submitLock.current = false }
  }
  return <><ui.Title title="payment" hint="paymentHint" /><div className="portal-two-col"><section className="portal-card"><fieldset className="booking-payment-options" disabled={busy || checkingCard}><legend>{t('payment')}</legend>{[['online', CreditCard, 'onlineHint'], ['laboratory', Building2, 'laboratoryHint']].map(([method, Icon, hint]) => <label className={draft.method === method ? 'is-selected' : ''} key={method}><input type="radio" name="payment-method" value={method} checked={draft.method === method} onChange={() => { dispatch({ type: 'CHECKOUT_METHOD', method }); setError('') }} /><Icon size={24} aria-hidden="true" /><span><strong>{t(method)}</strong><small>{t(hint)}</small></span></label>)}</fieldset>{draft.method === 'online' && <HostedCardForm key={api.language} ref={hostedFields} t={t} disabled={busy || checkingCard} language={api.language} receiptEmail={receiptEmail} emailError={emailError} onEmailChange={value => { setReceiptEmail(value); setEmailError(false); setError('') }} />}{error && <p className="portal-error" role="alert">{t(error)}</p>}<div className="portal-actions"><ui.Button secondary disabled={busy || checkingCard} onClick={() => navigate('book')}>{t('bookingEdit')}</ui.Button><ui.Button disabled={busy || checkingCard} onClick={openDialog}>{busy || checkingCard ? t('bookingProcessing') : draft.method === 'online' ? <>{t('cardPayLabel')} {api.money(totalPrice(draft.tests, state.tests))}</> : t(draft.method === 'laboratory' ? 'confirmBooking' : 'confirmPay')}</ui.Button></div></section><section className="portal-card"><BookingSummary api={api} ui={ui} draft={draft} /></section></div>{dialogOpen && <BookingDialog api={api} title="bookingFinalReview" confirmLabel="confirmBooking" cancelLabel="bookingEdit" busy={busy} onClose={() => setDialogOpen(false)} onConfirm={submit}><BookingSummary api={api} ui={ui} draft={draft} finalReview /></BookingDialog>}</>
}
