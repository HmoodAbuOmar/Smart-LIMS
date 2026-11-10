import { useEffect, useRef, useState } from 'react'
import { ChartNoAxesCombined, FileSearch, Printer, X, CalendarCheck, FlaskConical, Receipt, Undo2, Wallet } from 'lucide-react'
import { formatCurrency } from '../../utils/currency.js'
import { reportsCopy } from './reportsCopy.js'
import { reportsService } from './reportsService.js'
import { buildReport, defaultPeriod, periodErrors } from './reportsModel.js'
import './reports.css'

function SourceDetails({ copy, onClose, opener }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { element.close(); if (opener.isConnected) opener.focus() }
  }, [opener])
  return <dialog ref={dialog} className="rp-sources" aria-labelledby="rp-sources-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h3 id="rp-sources-title">{copy.sources}</h3><button autoFocus type="button" aria-label={copy.close} onClick={onClose}><X size={19} /></button></header>
    <p>{copy.sourceIntro}</p><ul>{['sourceOrders', 'sourceTests', 'sourceAppointments', 'sourceSamples', 'sourceFinancial'].map(key => <li key={key}>{copy[key]}</li>)}</ul><p>{copy.timezone}</p><p>{copy.sourceExport}</p>
  </dialog>
}
function StatusTable({ title, countLabel, rows, copy, language }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const percentage = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 })
  return <section className="rp-panel rp-status-table"><h3>{title}</h3><table><caption className="rp-sr-only">{title}</caption><thead><tr><th scope="col">{copy.status}</th><th scope="col">{countLabel}</th><th scope="col">{copy.share}</th></tr></thead><tbody>{rows.map(row => <tr key={row.status} className={`rp-status-${row.status}`}><th scope="row">{copy[row.status]}</th><td className="rp-count">{row.count.toLocaleString(language)}</td><td className="rp-share"><div className="rp-share-content">{total > 0 && <span className="rp-share-track" aria-hidden="true"><span style={{ inlineSize: `${row.count / total * 100}%` }} /></span>}<bdi>{total ? percentage.format(row.count / total) : '—'}</bdi></div></td></tr>)}</tbody></table></section>
}
function displayDate(value, language) {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}
export default function AdminReports({ language = 'en', service = reportsService }) {
  const copy = reportsCopy[language]
  const [draft, setDraft] = useState(defaultPeriod)
  const [applied, setApplied] = useState(defaultPeriod)
  const [invalid, setInvalid] = useState(false)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [sourceOpener, setSourceOpener] = useState(null)
  useEffect(() => {
    let live = true
    service.load().then(value => { if (live) { setData(value); setStatus('ready') } }, error => { if (live) setStatus(error.code === 'REPORTS_UNAVAILABLE' ? 'unavailable' : 'error') })
    return () => { live = false }
  }, [attempt, service])
  const report = data && status === 'ready' ? buildReport(data, applied) : null
  const changed = draft.from !== applied.from || draft.to !== applied.to
  function apply(event) {
    event.preventDefault()
    const bad = !draft.from || !draft.to || Object.keys(periodErrors(draft)).length > 0
    setInvalid(bad)
    if (!bad) setApplied({ ...draft })
  }
  return <section className="admin-reports" aria-labelledby="rp-title" aria-busy={status === 'loading'}>
    <header className="rp-heading"><span className="rp-heading-icon"><ChartNoAxesCombined size={23} aria-hidden="true" /></span><div><h2 id="rp-title">{copy.title}</h2><p>{copy.subtitle}</p></div><div className="rp-heading-actions"><button type="button" onClick={event => setSourceOpener(event.currentTarget)}><FileSearch size={16} aria-hidden="true" />{copy.sources}</button><button type="button" disabled={!report} onClick={() => window.print()}><Printer size={16} aria-hidden="true" />{copy.print}</button></div></header>
    <form className="rp-toolbar rp-panel" noValidate onSubmit={apply}>
      <strong className="rp-toolbar-title">{copy.reportingPeriod}</strong>
      {['from', 'to'].map(field => <label key={field} htmlFor={`rp-${field}`}>{copy[field]}<input id={`rp-${field}`} type="date" required value={draft[field]} aria-invalid={invalid} aria-describedby={invalid ? 'rp-error' : undefined} onChange={event => { setDraft(current => ({ ...current, [field]: event.target.value })); setInvalid(false) }} /></label>)}
      <button type="submit" className="rp-primary">{copy.apply}</button>
      {invalid && <p id="rp-error" role="alert" className="rp-error">{copy.invalid}</p>}
      {changed && <p className="rp-unapplied" role="status" title={copy.unapplied}>{copy.period}: {displayDate(applied.from, language)} – {displayDate(applied.to, language)}</p>}
    </form>
    <div className="rp-period"><strong>{copy.period}: </strong><span>{displayDate(applied.from, language)} – {displayDate(applied.to, language)}</span></div>
    {status !== 'ready' ? <div className="rp-state rp-panel" role={status === 'loading' ? 'status' : 'alert'}><p>{copy[status]}</p>{status === 'error' && <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button>}</div> : <>
      {report.empty && <p className="rp-empty rp-panel" role="status">{copy.empty}</p>}
      <div className="rp-operational"><div className="rp-status-grid"><StatusTable title={copy.orders} countLabel={copy.orderCount} rows={report.ordersByStatus} copy={copy} language={language} /><StatusTable title={copy.tests} countLabel={copy.testCount} rows={report.testsByStatus} copy={copy} language={language} /></div>
        <div className="rp-attendance-grid"><section className="rp-panel rp-attendance"><h3><CalendarCheck size={18} aria-hidden="true" />{copy.appointments}</h3>{report.attendance ? <dl>{['scheduled', 'attended', 'noShow'].map(key => <div key={key}><dt>{copy[key]}</dt><dd>{report.attendance[key].toLocaleString(language)}</dd></div>)}</dl> : <p>{copy.sectionUnavailable}</p>}</section><section className="rp-panel rp-rejected"><h3><FlaskConical size={18} aria-hidden="true" />{copy.rejected}</h3><p>{report.rejected === null ? copy.sectionUnavailable : report.rejected.toLocaleString(language)}</p></section></div>
      </div>
      <section className="rp-panel rp-financial-panel" aria-labelledby="rp-financial-title"><h3 id="rp-financial-title" className="rp-section-title">{copy.financial}</h3><div className="rp-financial">{[
        { label: 'receipts', key: 'receiptsCents', Icon: Receipt }, { label: 'refunds', key: 'refundsCents', Icon: Undo2 }, { label: 'net', key: 'netCents', Icon: Wallet },
      ].map(({ label, key, Icon }) => <div key={key}><h4><Icon size={18} aria-hidden="true" />{copy[label]}</h4><p><bdi>{formatCurrency(report.financial[key] / 100, language)}</bdi></p></div>)}</div></section>
    </>}
    {sourceOpener && <SourceDetails copy={copy} opener={sourceOpener} onClose={() => setSourceOpener(null)} />}
  </section>
}
