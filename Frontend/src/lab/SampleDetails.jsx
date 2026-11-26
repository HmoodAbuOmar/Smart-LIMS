import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { worklistCopy } from './worklistCopy.js'
import { detailActions, linkedTests, typeContainer } from './sampleListModel.js'
import { formatCollectionTime } from './collectSampleModel.js'
import { loadSampleDetails, receiptVersion, submitReceipt } from './sampleDetailsService.js'
import { loadRejectionVersion } from './rejectSampleService.js'
import { useLabNotice } from './LabTechnicianLayout.jsx'

function Badge({ status, copy }) {
  if (!status) return copy.empty
  return <span className={`lab-badge lab-${status}`}>{copy[status]}</span>
}

const RECEIVE_ERRORS = {
  SAMPLE_CHANGED: 'receiveChanged',
  SAMPLE_STATE_CONFLICT: 'receiveState',
}

export default function SampleDetails({ sampleId, previewSample = null, onBack, onReject, onReplace }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const notify = useLabNotice()
  const heading = useRef(null)
  const alertId = useId()
  const request = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(previewSample ? 'ready' : 'loading')
  const [sample, setSample] = useState(() => previewSample ? { ...previewSample, tests: linkedTests(previewSample), replacement: previewSample.replacement || '' } : null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (previewSample) return undefined
    const controller = new AbortController()
    loadSampleDetails(sampleId, { signal: controller.signal }).then(
      next => { if (!controller.signal.aborted) { setSample(next); setStatus('ready') } },
      () => { if (!controller.signal.aborted) setStatus('error') },
    )
    return () => controller.abort()
  }, [attempt, previewSample, sampleId])
  const actions = detailActions(sample)
  const tests = sample?.tests || []
  const show = value => value || copy.empty
  const when = value => formatCollectionTime(value, language) || copy.empty
  async function receive() {
    if (!actions.receive || pending) return
    if (previewSample) {
      setError(copy.receivePreview)
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError('')
    try {
      const expectedVersion = receiptVersion(sample) ?? await loadRejectionVersion(sample.id, { signal: controller.signal })
      if (expectedVersion == null) {
        setError(copy.receiveSaveError)
        return
      }
      const saved = await submitReceipt({ id: sample.id, expectedVersion }, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (saved?.confirmed !== true) {
        setError(copy.receiveUnconfirmed)
        return
      }
      setSample(current => ({ ...current, ...saved.sample, orderNumber: current.orderNumber, patientName: current.patientName, tests: current.tests, replacement: current.replacement }))
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(copy[RECEIVE_ERRORS[failure?.code]] || copy.receiveSaveError)
    } finally {
      if (!controller.signal.aborted) setPending(false)
    }
  }
  const back = <button type="button" className="lab-collect-back" onClick={onBack}>{copy.back}</button>
  return <div className="lab-collect-screen">
    <div className="lab-heading">
      <div>
        <h1 tabIndex={-1} ref={heading}>{copy.sampleDetailsTitle}</h1>
        {sample && <div className="lab-detail-identity">
          <bdi>{sample.barcode || copy.empty}</bdi>
          <bdi>{sample.patientName || copy.empty}</bdi>
          <bdi>{sample.orderNumber || copy.empty}</bdi>
          <Badge status={sample.status} copy={copy} />
        </div>}
      </div>
    </div>
    {status === 'loading' ? <section className="lab-collect-card"><p className="lab-state" role="status">{copy.sampleDetailsLoading}</p>{back}</section> : status === 'error' ? <section className="lab-collect-card"><p className="lab-state" role="alert">{copy.sampleDetailsError} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p>{back}</section> : <div className="lab-detail-stack">
      <section className="lab-collect-card lab-detail-grid">
        <div><span>{copy.typeContainer}</span><bdi>{show(typeContainer(sample))}</bdi></div>
        <div><span>{copy.collected}</span><bdi>{when(sample.collectedAt)}</bdi></div>
        <div><span>{copy.received}</span><bdi>{when(sample.receivedAt)}</bdi></div>
        <div><span>{copy.rejection}</span><bdi>{show(sample.rejectionReason)}</bdi></div>
        <div><span>{copy.replacement}</span><bdi>{show(sample.replacement)}</bdi></div>
        <div><span>{copy.notes}</span><bdi>{show(sample.notes)}</bdi></div>
      </section>
      {error && <div className="lab-collect-alert" id={alertId} role="alert"><p>{error}</p></div>}
      <div className="lab-collect-actions">
        {actions.receive && <button type="button" className="lab-collect" disabled={pending} onClick={receive}>{copy.markReceived}</button>}
        {actions.reject && <button type="button" className="lab-outline" onClick={() => onReject?.(sample)}>{copy.rejectSample}</button>}
        {actions.replace && <button type="button" className="lab-outline" onClick={() => onReplace?.(sample.id)}>{copy.collectReplacement}</button>}
        <button type="button" className="lab-outline" disabled aria-describedby="lab-print-label">{copy.printLabel}</button>
        {back}
      </div>
      <p className="lab-detail-note" id="lab-print-label">{copy.printLabelMissing}</p>
      <section className="lab-panel" aria-labelledby="lab-linked-tests">
        <h2 id="lab-linked-tests">{copy.linkedTests}</h2>
        {tests.length === 0 ? <p className="lab-state" role="status">{copy.noLinkedTests}</p> : <div className="lab-table"><table>
          <thead><tr>
            <th scope="col">{copy.test}</th>
            <th scope="col"><span className="lab-sr">{copy.actions}</span></th>
          </tr></thead>
          <tbody>{tests.map(test => <tr key={test.orderItemId}>
            <td><bdi>{test.testName || copy.empty}</bdi></td>
            <td><button type="button" className="lab-outline" onClick={() => notify?.('openTest')}>{copy.openTest}</button></td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>}
  </div>
}
