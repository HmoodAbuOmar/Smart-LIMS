import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { worklistCopy } from './worklistCopy.js'
import { filterSamples, formatClock, orderPatient, sampleListAction, SAMPLE_STATUS_FILTERS, typeContainer } from './sampleListModel.js'
import { loadSampleList } from './sampleListService.js'
import { useLabNotice } from './LabTechnicianLayout.jsx'

function Badge({ status, copy }) {
  if (!status) return copy.empty
  return <span className={`lab-badge lab-${status}`}>{copy[status]}</span>
}

export default function SampleList({ preview = null, onCollect = null, onReplace = null, onReject = null, onOpen = null, reload = 0 }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const notify = useLabNotice()
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(preview ? 'ready' : 'loading')
  const [rows, setRows] = useState(preview || [])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  useEffect(() => {
    if (preview) return undefined
    const controller = new AbortController()
    loadSampleList({ signal: controller.signal }).then(
      next => { if (!controller.signal.aborted) { setRows(next); setStatus('ready') } },
      () => { if (!controller.signal.aborted) setStatus('error') },
    )
    return () => controller.abort()
  }, [attempt, preview, reload])
  const visible = filterSamples(rows, { search, status: filter })
  return <>
    <div className="lab-heading">
      <div>
        <h1>{copy.sampleTitle}</h1>
        <p>{copy.sampleSubtitle}</p>
      </div>
      <button type="button" id="lab-collect-sample" className="lab-collect" onClick={() => (onCollect ? onCollect() : notify?.('collect'))}>{copy.collect}</button>
    </div>
    <section className="lab-panel" aria-busy={status === 'loading'}>
      <div className="lab-filters lab-sample-filters">
        <label className="lab-field">
          <span>{copy.searchLabel}</span>
          <span className="lab-search">
            <input type="search" value={search} placeholder={copy.sampleSearchPlaceholder} onChange={event => setSearch(event.target.value)} />
          </span>
        </label>
        <label className="lab-field lab-sample-status">
          <span>{copy.statusLabel}</span>
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            {SAMPLE_STATUS_FILTERS.map(key => <option key={key} value={key}>{copy[key]}</option>)}
          </select>
        </label>
      </div>
      {status === 'loading' ? <p className="lab-state" role="status">{copy.sampleLoading}</p> : status === 'error' ? <p className="lab-state" role="alert">{copy.sampleError} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p> : visible.length === 0 ? <p className="lab-state" role="status">{rows.length ? copy.sampleNoMatches : copy.sampleEmpty}</p> : <div className="lab-table lab-sample-table"><table>
        <thead><tr>
          <th scope="col">{copy.barcode}</th>
          <th scope="col">{copy.orderPatient}</th>
          <th scope="col">{copy.typeContainer}</th>
          <th scope="col">{copy.statusLabel}</th>
          <th scope="col">{copy.collected}</th>
          <th scope="col">{copy.received}</th>
          <th scope="col">{copy.actions}</th>
        </tr></thead>
        <tbody>{visible.map(row => {
          const collected = formatClock(row.collectedAt, language)
          const received = formatClock(row.receivedAt, language)
          const identity = orderPatient(row)
          const specimen = typeContainer(row)
          return <tr key={row.id}>
            <td><span className="lab-mobile-label">{copy.barcode}</span><bdi>{row.barcode || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.orderPatient}</span><bdi>{identity || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.typeContainer}</span><bdi>{specimen || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.statusLabel}</span><Badge status={row.status} copy={copy} /></td>
            <td><span className="lab-mobile-label">{copy.collected}</span><bdi>{collected || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.received}</span><bdi>{received || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.actions}</span><span className="lab-row-actions"><button type="button" id={`lab-sample-${row.id}`} className="lab-sample-action lab-sample-open" onClick={() => (onOpen ? onOpen(row) : notify?.('openSample'))}>{copy.openSample}</button>{sampleListAction(row) === 'replace' ? <button type="button" id={`lab-replace-${row.id}`} className="lab-sample-action lab-sample-replace" onClick={() => (onReplace ? onReplace(row.id) : notify?.('openSample'))}>{copy.collectReplacement}</button> : sampleListAction(row) === 'reject' ? <button type="button" id={`lab-reject-${row.id}`} className="lab-sample-action lab-sample-reject" onClick={() => (onReject ? onReject(row) : notify?.('openSample'))}>{copy.rejectAction}</button> : null}</span></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>
  </>
}
