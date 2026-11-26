import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { worklistCopy } from './worklistCopy.js'
import { approvedListRows, approvedReviewHash, filterResultRows } from './reviewResultModel.js'
import { loadWorklist } from './worklistService.js'

const columns = ['test', 'patient', 'fileNumber', 'order', 'actions']

export default function ApprovedResults({ preview = null }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(preview ? 'ready' : 'loading')
  const [rows, setRows] = useState(() => approvedListRows(preview || []))
  const [search, setSearch] = useState('')
  useEffect(() => {
    if (preview) return undefined
    const controller = new AbortController()
    loadWorklist({ signal: controller.signal }).then(
      next => { if (!controller.signal.aborted) { setRows(approvedListRows(next.items)); setStatus('ready') } },
      () => { if (!controller.signal.aborted) setStatus('error') },
    )
    return () => controller.abort()
  }, [attempt, preview])
  const visible = filterResultRows(rows, search)
  const previewRoute = Boolean(preview) || window.location.hash.startsWith('#/__lab')
  return <>
    <div className="lab-heading">
      <div>
        <h1>{copy.approved}</h1>
        <p>{copy.approvedSubtitle}</p>
      </div>
    </div>
    <section className="lab-panel" aria-busy={status === 'loading'}>
      <div className="lab-filters lab-draft-filters">
        <label className="lab-search">
          <span className="lab-sr">{copy.searchLabel}</span>
          <Search size={16} aria-hidden="true" />
          <input type="search" value={search} placeholder={copy.draftSearchPlaceholder} onChange={event => setSearch(event.target.value)} />
        </label>
      </div>
      {status === 'loading' ? <p className="lab-state" role="status">{copy.approvedLoading}</p> : status === 'error' ? <p className="lab-state" role="alert">{copy.approvedError} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p> : visible.length === 0 ? <p className="lab-state" role="status">{rows.length ? copy.approvedNoMatches : copy.approvedEmpty}</p> : <div className="lab-table lab-draft-list-table"><table>
        <thead><tr>{columns.map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.resultId}>
          <td><span className="lab-mobile-label">{copy.test}</span><bdi>{row.testName || copy.empty}</bdi></td>
          <td><span className="lab-mobile-label">{copy.patient}</span><bdi>{row.patientName || copy.empty}</bdi></td>
          <td><span className="lab-mobile-label">{copy.fileNumber}</span><bdi>{row.patientNumber || copy.empty}</bdi></td>
          <td><span className="lab-mobile-label">{copy.order}</span><bdi>{row.orderNumber || copy.empty}</bdi></td>
          <td><span className="lab-mobile-label">{copy.actions}</span><button type="button" className="lab-outline" onClick={() => {
            const hash = approvedReviewHash(row.resultId, previewRoute)
            if (hash) window.location.hash = hash
          }}>{copy.openApproved}</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>
}
