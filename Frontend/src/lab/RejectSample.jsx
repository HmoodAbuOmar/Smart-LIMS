import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { worklistCopy } from './worklistCopy.js'
import { rejectionVersion } from './sampleListModel.js'
import { loadRejectionVersion, submitRejection } from './rejectSampleService.js'

const REJECT_ERRORS = {
  SAMPLE_IN_USE: 'rejectInUse',
  SAMPLE_CHANGED: 'rejectChanged',
  SAMPLE_STATE_CONFLICT: 'rejectState',
}

export default function RejectSample({ sample, preview = false, onBack, onRejected }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const heading = useRef(null)
  const alertId = useId()
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => () => request.current?.abort(), [])
  const ready = reason.trim().length > 0 && reason.trim().length <= 1000
  async function confirm(event) {
    event.preventDefault()
    if (!ready || pending) return
    if (preview) {
      setError(copy.rejectPreview)
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError('')
    try {
      const expectedVersion = rejectionVersion(sample?.version) ?? await loadRejectionVersion(sample.id, { signal: controller.signal })
      if (expectedVersion == null) {
        setError(copy.rejectSaveError)
        return
      }
      const saved = await submitRejection({ id: sample.id, expectedVersion, reason }, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (saved?.confirmed !== true) {
        setError(copy.rejectUnconfirmed)
        return
      }
      onRejected?.(saved.sample)
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(copy[REJECT_ERRORS[failure?.code]] || copy.rejectSaveError)
    } finally {
      if (!controller.signal.aborted) setPending(false)
    }
  }
  return <div className="lab-collect-screen">
    <div className="lab-heading">
      <div>
        <h1 tabIndex={-1} ref={heading}>{copy.rejectTitle}</h1>
        <dl className="lab-reject-facts">
          <div><dt>{copy.sample}</dt><dd><bdi>{sample?.barcode || copy.empty}</bdi></dd></div>
          <div><dt>{copy.patient}</dt><dd><bdi>{sample?.patientName || copy.empty}</bdi></dd></div>
          <div><dt>{copy.order}</dt><dd><bdi>{sample?.orderNumber || copy.empty}</bdi></dd></div>
        </dl>
      </div>
    </div>
    <form className="lab-collect-card" noValidate onSubmit={confirm}>
      <label className="lab-field">
        <span>{copy.rejectReason}</span>
        <textarea value={reason} rows={4} maxLength={1000} aria-invalid={error ? true : undefined} onChange={event => { setReason(event.target.value); setError('') }} />
      </label>
      {error && <div className="lab-collect-alert" id={alertId} role="alert"><p>{error}</p></div>}
      <div className="lab-collect-actions">
        <button type="submit" className="lab-collect" disabled={!ready || pending} aria-describedby={error ? alertId : undefined}>{copy.confirmRejection}</button>
        <button type="button" className="lab-collect-back" onClick={onBack}>{copy.back}</button>
      </div>
    </form>
  </div>
}
