import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { worklistCopy } from './worklistCopy.js'
import { filterWorklist, rowAction, STATUS_FILTERS, worklistCounts, worklistRows } from './worklistModel.js'
import { loadWorklist } from './worklistService.js'
import { useLabNotice } from './LabTechnicianLayout.jsx'

const columns = ['test', 'patient', 'order', 'sample', 'result', 'actions']

function Badge({ status, copy }) {
  if (!status) return copy.empty
  return <span className={`lab-badge lab-${status}`}>{copy[status]}</span>
}

export default function LaboratoryWorklist({ preview = null }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const notify = useLabNotice()
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(preview ? 'ready' : 'loading')
  const [data, setData] = useState(preview || { items: [], samples: [] })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const number = new Intl.NumberFormat(language === 'ar' ? 'ar' : 'en')
  useEffect(() => {
    if (preview) return undefined
    const controller = new AbortController()
    loadWorklist({ signal: controller.signal }).then(
      next => { if (!controller.signal.aborted) { setData(next); setStatus('ready') } },
      () => { if (!controller.signal.aborted) setStatus('error') },
    )
    return () => controller.abort()
  }, [attempt, preview])
  const rows = worklistRows(data.items, data.samples)
  const visible = filterWorklist(rows, { search, status: filter })
  const counts = worklistCounts(data.items, data.samples)
  const cards = [
    ['orderedTests', counts.orderedTests],
    ['receivedSamples', counts.receivedSamples],
    ['pendingPublication', counts.pendingPublication],
  ]
  return <>
    <div className="lab-heading">
      <div>
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </div>
      <button type="button" className="lab-collect" onClick={() => notify?.('collect')}>{copy.collect}</button>
    </div>
    <section className="lab-stats" aria-label={copy.title}>
      {cards.map(([key, value]) => <article key={key}><span>{copy[key]}</span><strong>{status === 'ready' ? number.format(value) : copy.empty}</strong></article>)}
    </section>
    <section className="lab-panel" aria-busy={status === 'loading'}>
      <div className="lab-filters">
        <label className="lab-search">
          <span className="lab-sr">{copy.searchLabel}</span>
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} placeholder={copy.searchPlaceholder} onChange={event => setSearch(event.target.value)} />
        </label>
        <label className="lab-status">
          <span className="lab-sr">{copy.statusLabel}</span>
          <select value={filter} onChange={event => setFilter(event.target.value)} aria-label={copy.statusLabel}>
            {STATUS_FILTERS.map(key => <option key={key} value={key}>{copy[key]}</option>)}
          </select>
        </label>
      </div>
      {status === 'loading' ? <p className="lab-state" role="status">{copy.loading}</p> : status === 'error' ? <p className="lab-state" role="alert">{copy.error} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p> : visible.length === 0 ? <p className="lab-state" role="status">{rows.length ? copy.noMatches : copy.noRows}</p> : <div className="lab-table"><table>
        <thead><tr>{columns.map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead>
        <tbody>{visible.map(row => {
          const action = rowAction(row)
          return <tr key={row.orderItemId}>
            <td><span className="lab-mobile-label">{copy.test}</span><bdi>{row.testName || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.patient}</span><bdi>{row.patientName || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.order}</span><bdi>{row.orderNumber || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.sample}</span><Badge status={row.sampleStatus} copy={copy} /></td>
            <td><span className="lab-mobile-label">{copy.result}</span><Badge status={row.resultStatus} copy={copy} /></td>
            <td><span className="lab-mobile-label">{copy.actions}</span><button type="button" className="lab-outline" onClick={() => notify?.(action)}>{copy[action]}</button></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>
  </>
}
