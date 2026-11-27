import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { worklistCopy } from './worklistCopy.js'
import { draftEditorHash } from './draftResultModel.js'
import { loadDraftResult } from './draftResultService.js'
import { reviewAudience, reviewView } from './reviewResultModel.js'
import { publishedReportHash } from './publishedResultModel.js'
import { submitResultReview } from './reviewResultService.js'

const CHECKS = [
  ['values', 'checkValues'],
  ['sample', 'checkSample'],
  ['measured', 'checkMeasured'],
  ['record', 'checkRecord'],
]

const ACTION_ERRORS = {
  FORBIDDEN: 'reviewForbidden',
  RESULT_CHANGED: 'reviewChanged',
  RESULT_STATE_CONFLICT: 'reviewState',
  RESULT_INCOMPLETE: 'reviewIncomplete',
  RESULT_SPECIMEN_UNAVAILABLE: 'reviewSpecimen',
  VALIDATION_ERROR: 'reviewFailed',
  INVALID_JSON: 'reviewFailed',
}

function show(value, copy) {
  return value || copy.empty
}

export default function ResultReview({ resultId, preview = null, viewer = null }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const fixture = import.meta.env.DEV ? preview : null
  const reviewer = reviewAudience(viewer) === 'reviewer'
  const heading = useRef(null)
  const request = useRef(null)
  const lock = useRef(false)
  const alertId = useId()
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(() => fixture?.missing ? 'error' : fixture?.result ? 'ready' : 'loading')
  const [view, setView] = useState(() => fixture?.result ? reviewView(fixture.result, viewer) : null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState(null)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (fixture?.missing) {
      setStatus('error')
      setView(null)
      return undefined
    }
    if (fixture?.result) {
      setView(reviewView(fixture.result, viewer))
      setStatus('ready')
      return undefined
    }
    const controller = new AbortController()
    request.current = controller
    loadDraftResult(resultId, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      setView(reviewView(result, viewer))
      setStatus('ready')
    }, () => {
      if (!controller.signal.aborted) setStatus('error')
    })
    return () => controller.abort()
  }, [attempt, fixture, resultId, viewer])
  const previewRoute = Boolean(fixture) || window.location.hash.startsWith('#/__lab')
  async function submit(action) {
    if (lock.current || !view || status !== 'ready') return
    if (action === 'preview') {
      setNotice({ tone: 'error', key: 'previewReportMissing' })
      return
    }
    if (action === 'edit') {
      const hash = draftEditorHash(view.id || resultId, previewRoute)
      if (hash) window.location.hash = hash
      return
    }
    if (fixture) {
      setNotice({ tone: 'error', key: 'reviewPreview' })
      return
    }
    if (action === 'approve' || action === 'publish') {
      if (!reviewer || !view.actions[action]) return
    }
    const controller = new AbortController()
    request.current = controller
    lock.current = true
    setPending(true)
    setNotice(null)
    try {
      const saved = await submitResultReview(view.id || resultId, action, view.version, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (saved?.confirmed !== true) {
        setNotice({ tone: 'error', key: 'reviewUnconfirmed' })
        return
      }
      if (action === 'publish') {
        const hash = publishedReportHash(saved.result?.id, previewRoute)
        if (hash) {
          window.location.hash = hash
          return
        }
        setNotice({ tone: 'error', key: 'reportRouteMissing' })
      }
      setView(reviewView(saved.result, viewer))
    } catch (failure) {
      if (controller.signal.aborted) return
      setNotice({ tone: 'error', key: ACTION_ERRORS[failure?.code] || 'reviewFailed' })
    } finally {
      if (!controller.signal.aborted) {
        lock.current = false
        setPending(false)
      }
    }
  }
  const identity = view ? [view.patientName, view.patientNumber, view.orderNumber, view.versionLabel] : []
  const actions = view?.actions || {}
  const buttons = [
    reviewer && actions.publish ? ['publish', 'publishResult', 'lab-collect'] : null,
    reviewer && actions.approve ? ['approve', 'approveResult', 'lab-collect'] : null,
    actions.edit ? ['edit', view.status === 'DRAFT' ? 'editDraft' : 'editResult', 'lab-draft-review'] : null,
    actions.preview ? ['preview', 'previewReport', 'lab-draft-review'] : null,
  ].filter(Boolean)
  return <div className="lab-review-screen">
    <div className="lab-heading">
      <div>
        <h1 tabIndex={-1} ref={heading}>{reviewer ? copy.reviewTitle : copy.reviewDraftTitle}</h1>
        {view && <p className="lab-draft-meta">
          <span className="lab-draft-meta-text">{identity.map((part, index) => <span key={index}>{index > 0 && <span aria-hidden="true"> · </span>}<bdi>{show(part, copy)}</bdi></span>)}</span>
          {view.status && <span className={`lab-badge lab-${view.status}`}>{copy[view.status]}</span>}
        </p>}
      </div>
    </div>
    {status === 'loading' ? <section className="lab-review-card"><p className="lab-state" role="status">{copy.reviewLoading}</p></section> : status === 'error' || !view ? <section className="lab-review-card"><p className="lab-state" role="alert">{copy.reviewError} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p></section> : <div className="lab-review-stack">
      <section className="lab-review-card" aria-busy={pending || undefined}>
        <h2>{copy.checklistTitle}</h2>
        <ul className="lab-review-checks">
          {CHECKS.map(([key, label]) => {
            const confirmed = view.checks[key]
            return <li key={key} className={confirmed ? 'is-confirmed' : undefined}>
              <span className="lab-review-mark" aria-hidden="true">{confirmed ? <Check size={14} strokeWidth={2.75} /> : null}</span>
              <span>{copy[label]}</span>
              <span className="lab-sr">{confirmed ? copy.checkConfirmed : copy.checkOpen}</span>
            </li>
          })}
        </ul>
        {buttons.length > 0 && <div className="lab-review-actions">
          {buttons.map(([action, label, className]) => <button key={action} type="button" className={className} disabled={pending || undefined} onClick={() => { void submit(action) }}>{copy[label]}</button>)}
        </div>}
        {!reviewer && <p className="lab-draft-note" role="status">{copy.reviewerHandled}{view.status === 'DRAFT' ? ` ${copy.reviewerHandoffMissing}` : ''}</p>}
        {notice && <p id={alertId} className="lab-collect-alert" role="alert">{copy[notice.key]}</p>}
      </section>
      <section className="lab-review-card" aria-labelledby="lab-review-result-heading">
        <h2 id="lab-review-result-heading" className="lab-review-heading">
          <bdi>{show(view.testName, copy)}</bdi>
          <span className="lab-review-sample"><bdi>{show(view.sampleReference, copy)}</bdi></span>
        </h2>
        <div className="lab-table lab-review-table">
          <table>
            <thead><tr>{['parameter', 'value', 'unit', 'reference', 'flag', 'notes'].map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead>
            <tbody>{view.rows.map(row => <tr key={row.parameterId || row.name}>
              <th scope="row"><span className="lab-mobile-label">{copy.parameter}</span><bdi>{show(row.name, copy)}</bdi></th>
              <td><span className="lab-mobile-label">{copy.value}</span><bdi>{show(row.valueText, copy)}</bdi></td>
              <td><span className="lab-mobile-label">{copy.unit}</span><bdi>{show(row.unit, copy)}</bdi></td>
              <td><span className="lab-mobile-label">{copy.reference}</span><bdi>{show(row.reference, copy)}</bdi></td>
              <td><span className="lab-mobile-label">{copy.flag}</span>{row.flag ? <span className={`lab-draft-flag lab-draft-flag-${row.flag}`}>{copy.flags[row.flag]}</span> : copy.empty}</td>
              <td><span className="lab-mobile-label">{copy.notes}</span><bdi>{show(row.notes, copy)}</bdi></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>}
  </div>
}
