import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { mountHostedPaymentFields, paymentReference } from '../../../services/hostedPayment.js'

// Card values are never read, received as callbacks, or held in React state.
// A configured processor owns every card input in cross-origin iframes.
export default function HostedCardForm({ ref, t, language, receiptEmail, onEmailChange, emailError, disabled }) {
  const id = useId(), containers = useRef({}), controller = useRef(null), readiness = useRef(Promise.resolve(null))
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const abort = new AbortController()
    let fields
    readiness.current = mountHostedPaymentFields({ containers: containers.current, locale: language, signal: abort.signal }).then(result => {
      fields = result
      if (!abort.signal.aborted) { controller.current = result; setStatus(result ? 'ready' : 'unavailable') }
      return result
    }).catch(() => { if (!abort.signal.aborted) setStatus('unavailable'); return null })
    return () => { abort.abort(); controller.current = null; fields?.destroy() }
  }, [language])
  useImperativeHandle(ref, () => ({
    async validate() {
      await readiness.current
      if (!controller.current) return 'cardUnavailable'
      try { return await controller.current.validate() === true ? null : 'cardInvalid' } catch { return 'cardUnavailable' }
    },
    async confirm(session) {
      if (!controller.current) throw new Error('Hosted payment unavailable')
      return paymentReference(await controller.current.confirm({ session }))
    },
  }), [])
  const fields = [['cardholder', 'cardholderName', 'cardholderPlaceholder'], ['number', 'cardNumber', 'cardNumberPlaceholder'], ['expiry', 'cardExpiry', 'cardExpiryPlaceholder'], ['cvc', 'cardCvc', 'cardCvcPlaceholder']]
  return <section className="booking-card-form" aria-busy={status === 'loading'}>
    <header><h2><LockKeyhole size={18} aria-hidden="true" />{t('cardDetails')}</h2><div className="booking-card-brands" dir="ltr" aria-label="Visa / Mastercard"><span className="booking-visa">VISA</span><span className="booking-mastercard"><span aria-hidden="true"><i /><i /></span>Mastercard</span></div></header>
    <div className="booking-card-fields">{fields.map(([key, label, hint]) => <div className={`portal-field${key === 'cardholder' || key === 'number' ? ' booking-card-wide' : ''}`} key={key}>
      <span id={`${id}-${key}`}>{t(label)}</span>
      <div className="booking-hosted-slot" data-hosted-field={key} ref={node => { if (node) containers.current[key] = node }} role="group" aria-labelledby={`${id}-${key}`} aria-disabled={status !== 'ready'} dir={key === 'cardholder' ? undefined : 'ltr'}>
        {status !== 'ready' && <span className="booking-hosted-placeholder">{t(hint)}</span>}
      </div>
    </div>)}</div>
    {status === 'loading' && <p role="status">{t('cardLoading')}</p>}
    <div className="portal-field"><label htmlFor={`${id}-email`}>{t('receiptEmail')}</label><input id={`${id}-email`} name="receipt-email" type="email" autoComplete="email" dir="ltr" required disabled={disabled} value={receiptEmail} onChange={event => onEmailChange(event.target.value)} placeholder={t('receiptEmailPlaceholder')} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? `${id}-email-error` : undefined} />{emailError && <span id={`${id}-email-error`} className="portal-error" role="alert">{t('receiptEmailInvalid')}</span>}</div>
  </section>
}
