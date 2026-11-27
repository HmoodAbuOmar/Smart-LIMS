import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { worklistCopy } from './worklistCopy.js'
import { formatCollectionTime, parseCollectionTime } from './collectSampleModel.js'
import { draftPayload, draftReviewHash, editorState, problemKey, versionMark } from './draftResultModel.js'
import { loadDraftEvidence, loadDraftResult, saveDraft } from './draftResultService.js'

const COLUMNS = ['parameter', 'value', 'comparator', 'unit', 'reference', 'flag', 'note']
const COMPARATORS = ['<', '<=', '>', '>=']
const SAVE_ERRORS = {
  RESULT_CHANGED: 'saveChanged',
  RESULT_STATE_CONFLICT: 'saveState',
  RESULT_SPECIMEN_UNAVAILABLE: 'saveSpecimen',
  VALIDATION_ERROR: 'saveInvalid',
  INVALID_JSON: 'saveInvalid',
}

function show(value, copy) {
  return value || copy.empty
}

function screenStatus(result, form) {
  if (!result || (result.status !== 'DRAFT' && result.status !== 'APPROVED')) return 'notDraft'
  return form?.rows?.length ? 'ready' : 'noParameters'
}

function DraftRow({ row, copy, pending, invalid, onChange }) {
  const numeric = row.resultType !== 'TEXT'
  const valueInvalid = invalid.has(`value:${row.parameterId}`)
  const comparatorInvalid = invalid.has(`comparator:${row.parameterId}`)
  const noteInvalid = invalid.has(`note:${row.parameterId}`)
  return <tr>
    <th scope="row"><span className="lab-mobile-label">{copy.parameter}</span><bdi>{show(row.name, copy)}</bdi></th>
    <td>
      <span className="lab-mobile-label">{copy.value}</span>
      <input
        aria-label={`${copy.value} ${row.name}`}
        dir={numeric ? 'ltr' : undefined}
        inputMode={numeric ? 'decimal' : 'text'}
        autoComplete="off"
        spellCheck={false}
        maxLength={numeric ? 40 : 10000}
        disabled={pending || undefined}
        aria-invalid={valueInvalid || undefined}
        value={row.valueText}
        onChange={event => onChange({ valueText: event.target.value })}
      />
    </td>
    <td>
      <span className="lab-mobile-label">{copy.comparator}</span>
      <select
        aria-label={`${copy.comparator} ${row.name}`}
        dir="ltr"
        disabled={!numeric || pending || undefined}
        aria-invalid={comparatorInvalid || undefined}
        value={row.comparator}
        onChange={event => onChange({ comparator: event.target.value })}
      >
        <option value="">{copy.empty}</option>
        {COMPARATORS.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
    </td>
    <td><span className="lab-mobile-label">{copy.unit}</span><bdi className="lab-draft-read">{show(row.unit, copy)}</bdi></td>
    <td><span className="lab-mobile-label">{copy.reference}</span><bdi className="lab-draft-read">{show(row.reference, copy)}</bdi></td>
    <td><span className="lab-mobile-label">{copy.flag}</span><span className={`lab-draft-flag lab-draft-flag-${row.flag}`}>{copy.flags[row.flag] || copy.empty}</span></td>
    <td>
      <span className="lab-mobile-label">{copy.note}</span>
      <input
        aria-label={`${copy.note} ${row.name}`}
        autoComplete="off"
        maxLength={2000}
        disabled={pending || undefined}
        aria-invalid={noteInvalid || undefined}
        value={row.notes}
        onChange={event => onChange({ notes: event.target.value })}
      />
    </td>
  </tr>
}

export default function DraftResultEditor({ resultId, preview = null }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const fixture = import.meta.env.DEV ? preview : null
  const heading = useRef(null)
  const request = useRef(null)
  const lock = useRef(false)
  const seenLanguage = useRef(language)
  const languageRef = useRef(language)
  const evidence = useRef(fixture ? { samples: fixture.samples || [], visits: fixture.visits || [] } : { samples: [], visits: [] })
  const alertId = useId()
  const samplesId = useId()
  languageRef.current = language
  const opened = fixture?.result ? editorState(fixture.result, fixture.samples || [], fixture.visits || [], language) : null
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(() => fixture?.missing ? 'error' : !opened ? 'loading' : screenStatus(fixture.result, opened))
  const [form, setForm] = useState(opened)
  const [pending, setPending] = useState(false)
  const [problems, setProblems] = useState([])
  const [notice, setNotice] = useState(null)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (seenLanguage.current === language) return undefined
    seenLanguage.current = language
    setForm(current => {
      if (!current?.measuredText) return current
      const parsed = parseCollectionTime(current.measuredText)
      return parsed ? { ...current, measuredText: formatCollectionTime(parsed, language) } : current
    })
    return undefined
  }, [language])
  useEffect(() => {
    if (fixture?.missing) {
      setStatus('error')
      return undefined
    }
    if (fixture) {
      evidence.current = { samples: fixture.samples || [], visits: fixture.visits || [] }
      const next = editorState(fixture.result, evidence.current.samples, evidence.current.visits, languageRef.current)
      setForm(next)
      setStatus(screenStatus(fixture.result, next))
      return undefined
    }
    const controller = new AbortController()
    request.current = controller
    loadDraftResult(resultId, { signal: controller.signal }).then(async result => {
      if (controller.signal.aborted) return
      if (result.status !== 'DRAFT' && result.status !== 'APPROVED') {
        setForm(editorState(result, [], [], languageRef.current))
        setStatus('notDraft')
        return
      }
      const loaded = await loadDraftEvidence(result.orderId, { signal: controller.signal })
      if (controller.signal.aborted) return
      evidence.current = loaded
      const next = editorState(result, loaded.samples, loaded.visits, languageRef.current)
      setForm(next)
      setStatus(next.rows.length ? 'ready' : 'noParameters')
    }, () => {
      if (!controller.signal.aborted) setStatus('error')
    })
    return () => controller.abort()
  }, [attempt, fixture, resultId])
  const invalid = new Set(problems.map(problemKey))
  function clearFeedback() {
    setProblems([])
    setNotice(null)
  }
  function updateMeasured(value) {
    clearFeedback()
    setForm(current => ({ ...current, measuredText: value }))
  }
  function toggleSample(id) {
    clearFeedback()
    setForm(current => {
      const selected = new Set(current.selected)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      return { ...current, selected: [...selected] }
    })
  }
  function updateRow(parameterId, patch) {
    clearFeedback()
    setForm(current => ({
      ...current,
      rows: current.rows.map(row => row.parameterId === parameterId ? { ...row, ...patch } : row),
    }))
  }
  async function submit(event, review) {
    event?.preventDefault?.()
    if (lock.current || !form || status !== 'ready') return
    const prepared = draftPayload(form, { review })
    if (!prepared.ok) {
      setProblems(prepared.problems)
      setNotice({ tone: 'error', key: review ? 'reviewInvalid' : 'saveInvalid' })
      return
    }
    if (fixture) {
      setProblems([])
      setNotice({ tone: 'error', key: 'savePreview' })
      return
    }
    const controller = new AbortController()
    request.current = controller
    lock.current = true
    setPending(true)
    setProblems([])
    setNotice(null)
    try {
      const saved = await saveDraft(resultId, prepared.body, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (saved?.confirmed !== true) {
        setNotice({ tone: 'error', key: 'saveUnconfirmed' })
        return
      }
      setForm(editorState(saved.result, evidence.current.samples, evidence.current.visits, languageRef.current))
      const reviewHash = review ? draftReviewHash(saved.result.id, window.location.hash.startsWith('#/__lab')) : ''
      if (review && reviewHash) {
        window.location.hash = reviewHash
        return
      }
      setNotice({ tone: 'status', key: review ? 'reviewMissing' : 'draftSaved' })
    } catch (failure) {
      if (controller.signal.aborted) return
      setNotice({ tone: 'error', key: SAVE_ERRORS[failure?.code] || 'saveDraftError' })
    } finally {
      if (!controller.signal.aborted) {
        lock.current = false
        setPending(false)
      }
    }
  }
  const identity = form ? [form.testName, form.patientName, form.patientNumber, form.orderNumber, versionMark(form.versionNumber)] : []
  const selected = new Set(form?.selected || [])
  return <div className="lab-draft-screen">
    <div className="lab-heading">
      <div>
        <h1 tabIndex={-1} ref={heading}>{copy.editorTitle}</h1>
        {form && <p className="lab-draft-meta">
          <span className="lab-draft-meta-text">{identity.map((part, index) => <span key={index}>{index > 0 && <span aria-hidden="true"> · </span>}<bdi>{show(part, copy)}</bdi></span>)}</span>
          {['DRAFT', 'APPROVED', 'PUBLISHED'].includes(form.status) && <span className={`lab-badge lab-${form.status}`}>{copy[form.status]}</span>}
        </p>}
      </div>
    </div>
    {status === 'loading' ? <section className="lab-draft-card"><p className="lab-state" role="status">{copy.editorLoading}</p></section> : status === 'error' ? <section className="lab-draft-card"><p className="lab-state" role="alert">{copy.editorError} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p></section> : status === 'notDraft' ? <section className="lab-draft-card"><p className="lab-state" role="status">{copy.editorNotDraft}</p></section> : status === 'noParameters' ? <section className="lab-draft-card"><p className="lab-state" role="status">{copy.editorNoParameters}</p></section> : <form className="lab-draft-card" noValidate aria-busy={pending || undefined} onSubmit={event => { void submit(event, false) }}>
      <label className="lab-field" htmlFor="draft-measured-at">
        <span>{copy.measurementTime}</span>
        <input id="draft-measured-at" autoComplete="off" spellCheck={false} disabled={pending || undefined} aria-invalid={invalid.has('measured') || undefined} aria-describedby={notice ? alertId : undefined} value={form.measuredText} onChange={event => updateMeasured(event.target.value)} onBlur={event => {
          const parsed = parseCollectionTime(event.target.value)
          if (!parsed) return
          const next = formatCollectionTime(parsed, language)
          setForm(current => current.measuredText === next ? current : { ...current, measuredText: next })
        }} />
      </label>
      <div className="lab-collect-links lab-draft-samples" role="group" aria-labelledby={samplesId} aria-invalid={invalid.has('samples') || undefined}>
        <p id={samplesId}>{copy.receivedSamplesUsed}</p>
        {form.samples.length === 0 ? <p className="lab-collect-none">{copy.noEligibleSamples}</p> : <ul>
          {form.samples.map(sample => <li key={sample.id}><label>
            <input type="checkbox" checked={selected.has(sample.id)} disabled={pending || undefined} onChange={() => toggleSample(sample.id)} />
            <span><bdi>{show(sample.barcode, copy)}</bdi>{' · '}<bdi>{show(sample.sampleType, copy)}</bdi></span>
          </label></li>)}
        </ul>}
      </div>
      <div className="lab-table lab-draft-table">
        <table>
          <thead><tr>{COLUMNS.map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead>
          <tbody>{form.rows.map(row => <DraftRow key={row.parameterId} row={row} copy={copy} pending={pending} invalid={invalid} onChange={patch => updateRow(row.parameterId, patch)} />)}</tbody>
        </table>
      </div>
      {notice && <p id={alertId} className={notice.tone === 'error' ? 'lab-collect-alert' : 'lab-draft-note'} role={notice.tone === 'error' ? 'alert' : 'status'}>{copy[notice.key]}</p>}
      <div className="lab-draft-actions">
        <button type="submit" className="lab-collect" disabled={pending || undefined}>{copy.saveDraft}</button>
        <button type="button" className="lab-draft-review" disabled={pending || undefined} onClick={event => { void submit(event, true) }}>{copy.saveAndReview}</button>
      </div>
    </form>}
  </div>
}
