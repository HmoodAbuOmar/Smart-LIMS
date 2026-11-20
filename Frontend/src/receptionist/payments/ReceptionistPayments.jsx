import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { periodErrors, summarize } from '../../admin/operationsPayments/operationsPaymentsModel.js'
import { ordersRoute } from '../orders/ordersModel.js'
import { displayPatientName } from '../patients/patientsModel.js'
import { money } from '../walk-in/walkInModel.js'
import { walkInService } from '../walk-in/walkInService.js'
import { ReceiptDialog, RecordPaymentDialog } from './PaymentDialogs.jsx'
import { paymentsCopy } from './paymentsCopy.js'
import { filterPayments, formatPaymentDate, paymentAmount, transactionCents } from './paymentsModel.js'
import '../orders/orders.css'

const pageSize = 4
const columns = ['number', 'order', 'patient', 'date', 'method', 'amount', 'status', 'actions']

export default function ReceptionistPayments({ service = walkInService }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = paymentsCopy[language]
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [filters, setFilters] = useState({ query: '', from: '', to: '', type: '' })
  const [page, setPage] = useState(0)
  const [recording, setRecording] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const orders = await service.listPaymentOrders()
        const patients = await Promise.all([...new Set(orders.map(order => order.patientId))].map(id => service.getPatient(id)))
        if (active) setData({ orders, patients: new Map(patients.map(patient => [patient.id, patient])) })
      } catch {
        if (active) setLoadError(true)
      }
    }
    void load()
    return () => { active = false }
  }, [service, attempt])

  function updateFilter(event) {
    const { name, value } = event.target
    setFilters(current => ({ ...current, [name]: value }))
    setPage(0)
  }

  function onSaved(transaction) {
    const order = data.orders.find(item => item.id === transaction.orderId)
    setData(current => ({ ...current, orders: current.orders.map(item => item.id === order.id
      ? { ...item, transactions: [...item.transactions.filter(entry => entry.id !== transaction.id), transaction] } : item) }))
    setRecording(false)
    setSaved(true)
    setPage(0)
    setReceipt({ transaction, order, patient: data.patients.get(order.patientId) })
  }

  const dateError = Object.keys(periodErrors(filters)).length > 0
  const rows = dateError || !data ? [] : filterPayments(data.orders.flatMap(order =>
    order.transactions.map(transaction => ({ transaction, order, patient: data.patients.get(order.patientId) }))), filters)
  const { netCents } = summarize({ orders: [], transactions: rows.map(({ transaction }) => ({
    ...transaction, amountCents: transactionCents(transaction),
  })) })
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))

  return <section className="ro-orders rp-payments" aria-labelledby="rp-title">
    <header className="ro-heading"><h1 id="rp-title">{copy.title}</h1>
      <button className="ro-primary" type="button" disabled={!data} onClick={() => { setSaved(false); setRecording(true) }}><Plus size={16} aria-hidden="true" />{copy.record}</button>
    </header>
    {saved && <p className="ro-success" role="status">{copy.saved}</p>}
    {!data ? <div className="ro-card ro-empty">
      {loadError ? <><p role="alert">{copy.loadError}</p><button type="button" onClick={() => { setLoadError(false); setAttempt(value => value + 1) }}>{copy.retry}</button></>
        : <p role="status">{copy.loading}</p>}
    </div> : <section className="ro-card">
      <div className="rp-filters">
        <label className="ro-search"><Search size={17} aria-hidden="true" /><input type="search" name="query" value={filters.query}
          onChange={updateFilter} aria-label={copy.search} placeholder={copy.search} /></label>
        {['from', 'to'].map(name => <label key={name}>{copy[name]}<input type="date" name={name} value={filters[name]}
          onChange={updateFilter} aria-invalid={dateError || undefined} /></label>)}
        <label>{copy.type}<select name="type" value={filters.type} onChange={updateFilter}>
          <option value="">{copy.all}</option><option value="PAYMENT">{copy.PAYMENT}</option><option value="REFUND">{copy.REFUND}</option>
        </select></label>
      </div>
      {dateError ? <p className="rp-error" role="alert">{copy.dateError}</p> : <>
        {rows.length ? <div className="rp-table" role="region" aria-label={copy.title} tabIndex={0}>
          <table>
            <thead><tr>{columns.map(key => <th key={key} scope="col" className={`rp-col-${key}`}>{copy[key]}</th>)}</tr></thead>
            <tbody>{rows.slice(page * pageSize, (page + 1) * pageSize).map(row => {
              const { transaction, order, patient } = row
              return <tr key={transaction.id}>
                <td><bdi>{transaction.receiptNumber || transaction.reference || '—'}</bdi></td>
                <td><a href={`#${ordersRoute(order.id)}`}><bdi>{order.orderNumber}</bdi></a></td>
                <td>{displayPatientName(patient, language)}</td>
                <td><bdi>{formatPaymentDate(transaction, language)}</bdi></td>
                <td>{copy[transaction.method] || '—'}</td>
                <td className="rp-col-amount"><bdi>{paymentAmount(transaction, language)}</bdi></td>
                <td className="rp-col-status"><span className={`ro-badge ro-${transaction.status}`}>{copy[transaction.status]}</span><div>{copy[transaction.type]}</div></td>
                <td className="rp-col-actions"><button type="button" onClick={() => setReceipt(row)}>{copy.view}</button></td>
              </tr>
            })}</tbody>
          </table>
        </div> : <p className="ro-empty">{copy.empty}</p>}
        {pages > 1 && <footer className="ro-pagination"><div>
          <button type="button" disabled={!page} onClick={() => setPage(value => value - 1)}>{copy.previous}</button>
          <span aria-live="polite">{(page + 1).toLocaleString(language)} / {pages.toLocaleString(language)}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>{copy.next}</button>
        </div></footer>}
        <p className="rp-collections">{copy.collections} <strong><bdi>{money(netCents, language)}</bdi></strong></p>
      </>}
    </section>}
    {recording && <RecordPaymentDialog {...data} service={service} language={language} onClose={() => setRecording(false)} onSaved={onSaved} />}
    {receipt && <ReceiptDialog row={receipt} language={language} onClose={() => setReceipt(null)} />}
  </section>
}
