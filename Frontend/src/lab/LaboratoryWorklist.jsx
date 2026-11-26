import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { worklistCopy } from './worklistCopy.js'
import { filterWorklist, rowAction, STATUS_FILTERS, worklistCounts, worklistRows } from './worklistModel.js'
import { OPEN_DRAFT_COPY, draftEditorHash, draftOpenDecision } from './draftResultModel.js'
import { createOrOpenDraft } from './draftResultService.js'
import { loadWorklist } from './worklistService.js'
import { useLabNotice } from './LabTechnicianLayout.jsx'

const columns = ['test', 'patient', 'order', 'sample', 'result', 'actions']

function Badge({ status, copy }) {
  if (!status) return copy.empty
  return <span className={`lab-badge lab-${status}`}>{copy[status]}</span>
}

export default function LaboratoryWorklist({ preview = null, previewDraftId = null }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const notify = useLabNotice()
  const request = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(preview ? 'ready' : 'loading')
  const [data, setData] = useState(preview || { items: [], samples: [] })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [openingId, setOpeningId] = useState('')
  const [openNotice, setOpenNotice] = useState('')
  useEffect(() => () => request.current?.abort(), [])
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
  async function openRow(row) {
    if (openingId) return
    const decision = draftOpenDecision(row, data.samples)
    const previewRoute = Boolean(preview) || window.location.hash.startsWith('#/__lab')
    if (decision.action === 'open') {
      const hash = draftEditorHash(decision.resultId, previewRoute)
      if (hash) window.location.hash = hash
      else setOpenNotice(copy.openTestError)
      return
    }
    if (decision.action === 'create' && preview) {
      const hash = draftEditorHash(previewDraftId?.(decision.orderItemId) || '', true)
      if (hash) window.location.hash = hash
      else notify?.('openTest')
      return
    }
    if (decision.action !== 'create') {
      setOpenNotice(copy[OPEN_DRAFT_COPY[decision.reason]] || copy.openTestUnlinked)
      return
    }
    const controller = new AbortController()
    request.current?.abort()
    request.current = controller
    setOpeningId(row.orderItemId)
    setOpenNotice('')
    try {
      const saved = await createOrOpenDraft(decision.orderItemId, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (!saved?.confirmed || !saved.id) {
        setOpenNotice(copy.openTestUnconfirmed)
        return
      }
      window.location.hash = draftEditorHash(saved.id, false)
    } catch (failure) {
      if (controller.signal.aborted) return
      setOpenNotice(copy[OPEN_DRAFT_COPY[failure?.code]] || copy.openTestError)
    } finally {
      if (!controller.signal.aborted) setOpeningId('')
    }
  }
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
      {openNotice && <p className="lab-collect-alert" role="alert">{openNotice}</p>}
      {status === 'loading' ? <p className="lab-state" role="status">{copy.loading}</p> : status === 'error' ? <p className="lab-state" role="alert">{copy.error} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p> : visible.length === 0 ? <p className="lab-state" role="status">{rows.length ? copy.noMatches : copy.noRows}</p> : <div className="lab-table lab-worklist-table"><table>
        <thead><tr>{columns.map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead>
        <tbody>{visible.map(row => {
          const action = rowAction(row)
          return <tr key={row.orderItemId}>
            <td><span className="lab-mobile-label">{copy.test}</span><bdi>{row.testName || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.patient}</span><bdi>{row.patientName || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.order}</span><bdi>{row.orderNumber || copy.empty}</bdi></td>
            <td><span className="lab-mobile-label">{copy.sample}</span><Badge status={row.sampleStatus} copy={copy} /></td>
            <td><span className="lab-mobile-label">{copy.result}</span><Badge status={row.resultStatus} copy={copy} /></td>
            <td><span className="lab-mobile-label">{copy.actions}</span><button type="button" className="lab-outline" disabled={openingId === row.orderItemId || undefined} onClick={() => { void openRow(row) }}>{copy[action]}</button></td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>
  </>
}
