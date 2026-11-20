import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APPROVED_LOGO } from '../../components/BrandLogo.jsx'
import { displayPatientName } from '../patients/patientsModel.js'
import { money } from '../walk-in/walkInModel.js'
import { eligibleBalance, formatPaymentDate, paymentCents, paymentMethods, transactionCents } from './paymentsModel.js'
import { paymentsCopy } from './paymentsCopy.js'
import './payments.css'
import './receipt.css'

function PaymentDialog({ title, onClose, blocked, receiptLanguage, children }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  const content = <dialog ref={dialog} className={receiptLanguage ? 'rp-dialog rp-receipt' : 'rp-dialog'}
    lang={receiptLanguage} dir={receiptLanguage === 'ar' ? 'rtl' : receiptLanguage ? 'ltr' : undefined}
    aria-labelledby="rp-dialog-title"
    onCancel={event => { event.preventDefault(); if (!blocked) onClose() }}>
    {title && <h2 id="rp-dialog-title">{title}</h2>}
    {children}
  </dialog>
  return receiptLanguage ? createPortal(content, document.body) : content
}

export function RecordPaymentDialog({ orders, initialOrderId = '', patients, service, language, onClose, onSaved }) {
  const copy = paymentsCopy[language]
  const [orderId, setOrderId] = useState(initialOrderId)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const request = useRef(null)
  const eligible = orders.filter(eligibleBalance)
  const balance = eligibleBalance(eligible.find(order => order.id === orderId))

  async function submit(event) {
    event.preventDefault()
    if (lock.current) return
    const amountCents = paymentCents(amount.trim())
    if (!balance || !amountCents || amountCents > balance.outstanding || !paymentMethods.includes(method)) {
      setError('invalidPayment')
      return
    }
    const previous = request.current
    if (!previous || previous.orderId !== orderId || previous.amountCents !== amountCents || previous.method !== method) {
      request.current = { orderId, amountCents, method, idempotencyKey: crypto.randomUUID() }
    }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const transaction = await service.recordPayment(request.current)
      onSaved(transaction)
    } catch (failure) {
      setError(['invalidPayment', 'balanceChanged'].includes(failure.code) ? failure.code : 'saveError')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return <PaymentDialog title={copy.record} onClose={onClose} blocked={busy}>
    <form className="rp-form" noValidate onSubmit={submit}>
      {eligible.length ? <fieldset disabled={busy}>
        <label>{copy.order}<select required value={orderId} onChange={event => { setOrderId(event.target.value); setError('') }}>
          <option value="">{copy.chooseOrder}</option>
          {eligible.map(order => <option key={order.id} value={order.id}>
            {order.orderNumber} · {displayPatientName(patients.get(order.patientId), language)}
          </option>)}
        </select></label>
        {balance && <dl className="rp-summary">{['total', 'paid', 'outstanding'].map(key => <div key={key}><dt>{copy[key]}</dt><dd><bdi>{money(balance[key], language)}</bdi></dd></div>)}</dl>}
        <label>{copy.amount}<input required type="text" inputMode="decimal" dir="ltr" value={amount} onChange={event => { setAmount(event.target.value); setError('') }} /></label>
        <label>{copy.method}<select required value={method} onChange={event => { setMethod(event.target.value); setError('') }}>
          <option value="">{copy.chooseMethod}</option>
          {paymentMethods.map(value => <option key={value} value={value}>{copy[value]}</option>)}
        </select></label>
      </fieldset> : <p>{copy.noneEligible}</p>}
      {error && <p className="rp-error" role="alert">{copy[error]}</p>}
      <div className="rp-actions"><button type="button" disabled={busy} onClick={onClose}>{copy.close}</button>
        {eligible.length > 0 && <button type="submit" className="ro-primary" disabled={busy}>{busy ? copy.saving : copy.record}</button>}
      </div>
    </form>
  </PaymentDialog>
}

export function ReceiptDialog({ row: { transaction, order, patient }, language, onClose }) {
  const copy = paymentsCopy[language]
  const sheet = useRef(null)
  const printLock = useRef(false)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState(false)
  const date = formatPaymentDate(transaction, language)
  const receiptNumber = transaction.receiptNumber || transaction.reference
  const orderNumber = order.orderNumber
  const cents = transaction.amountCents == null && transaction.amount == null ? null : transactionCents(transaction)
  const amount = Number.isSafeInteger(cents) && cents >= 0
    ? `ILS ${new Intl.NumberFormat('en-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}`
    : null
  const details = {
    patient: patient && displayPatientName(patient, language),
    order: orderNumber,
    date: date === '—' ? null : date,
    type: copy[transaction.type],
    status: copy[transaction.status],
    method: copy[transaction.method],
  }
  const amountValue = amount ? <bdi dir="ltr">{amount}</bdi> : copy.unavailable
  const description = transaction.type === 'REFUND' ? copy.orderRefund : copy.orderPayment

  async function printReceipt() {
    if (printLock.current) return
    printLock.current = true
    setPrinting(true)
    setPrintError(false)
    try {
      await Promise.all([document.fonts.ready, ...Array.from(sheet.current.querySelectorAll('img'), image => image.decode())])
      window.print()
    } catch {
      setPrintError(true)
    } finally {
      printLock.current = false
      setPrinting(false)
    }
  }

  return <PaymentDialog receiptLanguage={language} onClose={onClose} blocked={printing}>
    <article className="rp-receipt-sheet" ref={sheet} aria-labelledby="rp-dialog-title">
      <img className="rp-receipt-watermark" src={APPROVED_LOGO} alt="" />
      <div className="rp-receipt-content">
        <header className="rp-receipt-header">
          <img className="rp-receipt-logo" src={APPROVED_LOGO} alt="Smart-LIMS" />
          <div className="rp-receipt-heading">
            <h2 id="rp-dialog-title">{copy.receipt}</h2>
            <p><span>{copy.number}</span>{receiptNumber ? <bdi dir="ltr">{receiptNumber}</bdi> : copy.unavailable}</p>
          </div>
        </header>
        <dl className="rp-receipt-details">{Object.entries(details).map(([key, value]) => <div key={key}>
          <dt>{copy[key]}</dt><dd>{value ? <bdi dir={key === 'order' ? 'ltr' : 'auto'}>{value}</bdi> : copy.unavailable}</dd>
        </div>)}</dl>
        <table className="rp-receipt-line">
          <thead><tr><th scope="col">{copy.description}</th><th scope="col">{copy.amount}</th></tr></thead>
          <tbody><tr><td>{orderNumber ? <>{description} <bdi dir="ltr">{orderNumber}</bdi></> : copy.orderUnavailable}</td><td>{amountValue}</td></tr></tbody>
        </table>
        <div className="rp-receipt-amount"><strong>{transaction.type === 'REFUND' ? copy.amountRefunded : copy.amountPaid}</strong><strong>{amountValue}</strong></div>
      </div>
    </article>
    {printError && <p className="rp-receipt-print-error" role="alert">{copy.printError}</p>}
    <div className="rp-actions"><button type="button" disabled={printing} onClick={onClose}>{copy.close}</button>
      <button type="button" className="ro-primary" disabled={printing} onClick={printReceipt}>{printing ? copy.preparingPrint : copy.print}</button></div>
  </PaymentDialog>
}
