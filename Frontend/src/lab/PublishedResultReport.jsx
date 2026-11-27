import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { worklistCopy } from './worklistCopy.js'
import { publishedHistoryRows, publishedListHash, publishedReportView } from './publishedResultModel.js'
import { loadPublishedHistory, loadPublishedResult } from './publishedResultService.js'

const VALUE_COLUMNS = ['parameter', 'value', 'unit', 'reference', 'flag', 'notes']
const HISTORY_COLUMNS = [
  ['historyVersion', 'version'],
  ['historyStatus', 'status'],
  ['historyApproved', 'approved'],
  ['historyPublished', 'published'],
  ['historySamples', 'samples'],
]

function show(value, copy) {
  return value || copy.empty
}

export default function PublishedResultReport({ resultId, preview = null }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const fixture = import.meta.env.DEV ? preview : null
  const heading = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [status, setStatus] = useState(() => fixture?.missing ? 'error' : fixture?.result ? 'ready' : 'loading')
  const [result, setResult] = useState(() => fixture?.result && fixture.result.status === 'PUBLISHED' ? fixture.result : null)
  const [unpublished, setUnpublished] = useState(false)
  const [versions, setVersions] = useState(() => fixture?.versions || null)
  const [historyStatus, setHistoryStatus] = useState(() => fixture?.versions ? 'ready' : 'loading')
  const [notice, setNotice] = useState('')
  const view = useMemo(() => publishedReportView(result, language), [language, result])
  // Laboratory staff may read every retained version, including a newer draft.
  // The report body stays on the published result that was opened.
  const history = useMemo(() => publishedHistoryRows(versions, language, { includeDrafts: true }), [language, versions])
  const previewRoute = Boolean(fixture) || window.location.hash.startsWith('#/__lab')
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    if (fixture?.missing) {
      setStatus('error')
      setResult(null)
      setUnpublished(false)
      setVersions(null)
      return undefined
    }
    if (fixture?.result) {
      const published = fixture.result.status === 'PUBLISHED'
      setResult(published ? fixture.result : null)
      setUnpublished(!published)
      setVersions(published ? fixture.versions || [] : null)
      setHistoryStatus(published ? 'ready' : 'loading')
      setStatus('ready')
      return undefined
    }
    const controller = new AbortController()
    setStatus('loading')
    setUnpublished(false)
    setVersions(null)
    setHistoryStatus('loading')
    loadPublishedResult(resultId, { signal: controller.signal }).then(loaded => {
      if (controller.signal.aborted) return
      if (String(loaded?.id) !== String(resultId)) {
        setStatus('error')
        return
      }
      if (loaded.status !== 'PUBLISHED') {
        setResult(null)
        setUnpublished(true)
        setStatus('ready')
        return
      }
      setResult(loaded)
      setStatus('ready')
    }, () => {
      if (!controller.signal.aborted) setStatus('error')
    })
    return () => controller.abort()
  }, [attempt, fixture, resultId])
  useEffect(() => {
    if (fixture || status !== 'ready' || !view?.orderItemId) return undefined
    const controller = new AbortController()
    setHistoryStatus('loading')
    loadPublishedHistory(view.orderItemId, { signal: controller.signal }).then(loaded => {
      if (controller.signal.aborted) return
      // History is display-only. A newer draft must not replace the opened publication.
      setVersions(Array.isArray(loaded) ? loaded : [])
      setHistoryStatus('ready')
    }, () => {
      if (!controller.signal.aborted) setHistoryStatus('error')
    })
    return () => controller.abort()
  }, [fixture, historyAttempt, status, view?.orderItemId])
  function openList() {
    const hash = publishedListHash(previewRoute)
    if (hash) window.location.hash = hash
  }
  function printReport() {
    if (typeof window.print !== 'function') {
      setNotice('printUnavailable')
      return
    }
    setNotice('')
    window.print()
  }
  const identity = view ? [view.patientName, view.patientNumber, view.orderNumber, view.versionLabel] : []
  const historyMissing = status === 'ready' && view && !view.orderItemId
  return <div className="lab-review-screen lab-report-screen">
    <div className="lab-heading">
      <div>
        <h1 tabIndex={-1} ref={heading}>{copy.reportTitle}</h1>
        {view && <p className="lab-draft-meta">
          <span className="lab-draft-meta-text">{identity.map((part, index) => <span key={index}>{index > 0 && <span aria-hidden="true"> · </span>}<bdi>{show(part, copy)}</bdi></span>)}</span>
          <span className="lab-badge lab-PUBLISHED">{copy.PUBLISHED}</span>
        </p>}
      </div>
    </div>
    {status === 'loading' ? <section className="lab-review-card"><p className="lab-state" role="status">{copy.reportLoading}</p></section> : status === 'error' ? <section className="lab-review-card"><p className="lab-state" role="alert">{copy.reportError} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p><button type="button" className="lab-draft-review" onClick={openList}>{copy.published}</button></section> : unpublished || !view ? <section className="lab-review-card"><p className="lab-state" role="alert">{copy.reportNotPublished}</p><button type="button" className="lab-draft-review" onClick={openList}>{copy.published}</button></section> : <div className="lab-review-stack">
      <section className="lab-review-card lab-report-card" aria-labelledby="lab-report-test-heading">
        <h2 id="lab-report-test-heading" className="lab-review-heading">
          <bdi>{show(view.testName, copy)}</bdi>
          <span className="lab-review-sample"><bdi>{show(view.sampleReference, copy)}</bdi></span>
        </h2>
        <div className="lab-detail-grid lab-report-facts">
          <div><span>{copy.approvedAt}</span><bdi>{show(view.approvedAt, copy)}</bdi></div>
          <div><span>{copy.publishedAt}</span><bdi>{show(view.publishedAt, copy)}</bdi></div>
        </div>
        {view.rows.length === 0 ? <p className="lab-state" role="status">{copy.reportNoParameters}</p> : <div className="lab-table lab-review-table"><table>
          <thead><tr>{VALUE_COLUMNS.map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead>
          <tbody>{view.rows.map(row => <tr key={row.parameterId || row.name}>
            <th scope="row"><span className="lab-mobile-label">{copy.parameter}</span><bdi>{show(row.name, copy)}</bdi></th>
            <td><span className="lab-mobile-label">{copy.value}</span><bdi>{show(row.valueText, copy)}</bdi></td>
            <td><span className="lab-mobile-label">{copy.unit}</span><bdi>{show(row.unit, copy)}</bdi></td>
            <td><span className="lab-mobile-label">{copy.reference}</span><bdi>{show(row.reference, copy)}</bdi></td>
            <td><span className="lab-mobile-label">{copy.flag}</span>{row.flag && copy.flags[row.flag] ? <span className={`lab-draft-flag lab-draft-flag-${row.flag}`}>{copy.flags[row.flag]}</span> : show(row.flag, copy)}</td>
            <td><span className="lab-mobile-label">{copy.notes}</span><bdi>{show(row.notes, copy)}</bdi></td>
          </tr>)}</tbody>
        </table></div>}
        <div className="lab-review-actions lab-report-actions">
          <button type="button" className="lab-collect" onClick={printReport}>{copy.printReport}</button>
          <button type="button" className="lab-draft-review" onClick={openList}>{copy.published}</button>
        </div>
        {notice && <p className="lab-collect-alert" role="alert">{copy[notice]}</p>}
      </section>
      <section className="lab-review-card lab-report-history" aria-labelledby="lab-report-history-heading">
        <h2 id="lab-report-history-heading">{copy.versionHistory}</h2>
        {historyMissing ? <p className="lab-state" role="alert">{copy.historyMissingItem}</p> : historyStatus === 'loading' ? <p className="lab-state" role="status">{copy.historyLoading}</p> : historyStatus === 'error' ? <p className="lab-state" role="alert">{copy.historyError} <button type="button" onClick={() => setHistoryAttempt(value => value + 1)}>{copy.retry}</button></p> : history.length === 0 ? <p className="lab-state" role="status">{copy.historyEmpty}</p> : <div className="lab-table lab-report-history-table"><table>
          <thead><tr>{HISTORY_COLUMNS.map(([key]) => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead>
          <tbody>{history.map(row => <tr key={row.id}>
            <td><span className="lab-mobile-label">{copy.historyVersion}</span><bdi>{show(row.versionLabel, copy)}</bdi>{row.current ? <span className="lab-report-current">{copy.currentVersion}</span> : null}</td>
            <td><span className="lab-mobile-label">{copy.historyStatus}</span>{row.status ? <span className={`lab-badge lab-${row.status}`}>{copy[row.status]}</span> : copy.empty}</td>
            <td><span className="lab-mobile-label">{copy.historyApproved}</span><bdi>{show(row.approvedAt, copy)}</bdi></td>
            <td><span className="lab-mobile-label">{copy.historyPublished}</span><bdi>{show(row.publishedAt, copy)}</bdi></td>
            <td><span className="lab-mobile-label">{copy.historySamples}</span><bdi>{show(row.samples, copy)}</bdi></td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>}
  </div>
}
