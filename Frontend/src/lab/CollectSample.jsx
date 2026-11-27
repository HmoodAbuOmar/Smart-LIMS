import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { worklistCopy } from './worklistCopy.js'
import { orderPatient } from './sampleListModel.js'
import { collectionReady, filterCollectionOrders, formatCollectionTime, normalizeReplacement, parseCollectionTime } from './collectSampleModel.js'
import { loadCollectionOrders, loadReplacementSource, loadSampleTypes, submitCollection, submitReplacement } from './collectSampleService.js'

function OrderCombo({ orders, orderId, onSelect, copy }) {
  const listId = useId()
  const root = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const selected = orders.find(order => order.orderId === orderId) || null
  const selectedLabel = selected ? orderPatient(selected) || selected.orderId : ''
  const matches = filterCollectionOrders(orders, open && query !== selectedLabel ? query : '')
  useEffect(() => {
    const selectedIndex = orders.findIndex(order => order.orderId === orderId)
    setActive(!query || query === selectedLabel ? Math.max(selectedIndex, 0) : 0)
  }, [query, open, orderId, orders, selectedLabel])
  useEffect(() => {
    if (!open) return undefined
    function close(event) {
      if (!root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  function show() {
    setOpen(true)
    setQuery(current => (open ? current : selectedLabel))
  }
  function pick(nextId) {
    onSelect(nextId)
    setQuery('')
    setOpen(false)
  }
  function edit(value) {
    setQuery(value)
    setOpen(true)
    if (selected && value !== selectedLabel) onSelect('')
  }
  function keyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      else setActive(index => Math.min(index + 1, Math.max(matches.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else setActive(index => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open && matches[active]) {
      event.preventDefault()
      pick(matches[active].orderId)
    } else if (event.key === 'Escape') setOpen(false)
  }
  return <div className="lab-order-combo" ref={root}>
    <input role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" placeholder={copy.chooseOrder} value={open ? query : selectedLabel} onPointerDown={show} onFocus={show} onChange={event => edit(event.target.value)} onKeyDown={keyDown} />
    {open && <ul id={listId} role="listbox" className="lab-order-menu" aria-label={copy.orderAndPatient}>
      {matches.length === 0 ? <li className="lab-order-empty">{copy.orderNoMatches}</li> : matches.map((order, index) => {
        const label = orderPatient(order) || order.orderId
        return <li key={order.orderId} role="presentation"><button type="button" role="option" id={`${listId}-${order.orderId}`} aria-selected={index === active} data-active={index === active || undefined} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(order.orderId)}><bdi>{label}</bdi></button></li>
      })}
    </ul>}
  </div>
}

export default function CollectSample({ preview = null, replacementId = '', replacementPreview = null, onBack, onRecorded }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const heading = useRef(null)
  const sampleTypeList = useId()
  const seenLanguage = useRef(language)
  const alertId = useId()
  const replacing = Boolean(replacementId)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState(preview || replacementPreview ? 'ready' : 'loading')
  const [orders, setOrders] = useState(preview?.orders || [])
  const [sampleTypes, setSampleTypes] = useState(preview?.sampleTypes || [])
  const [source, setSource] = useState(() => replacementPreview ? normalizeReplacement(replacementPreview) : null)
  const [orderId, setOrderId] = useState('')
  const [sampleType, setSampleType] = useState(() => source?.sampleType || '')
  const [containerType, setContainerType] = useState('')
  const [collectedText, setCollectedText] = useState(() => formatCollectionTime(new Date(), language))
  const [blocked, setBlocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState(null)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    if (seenLanguage.current === language) return undefined
    seenLanguage.current = language
    setCollectedText(current => formatCollectionTime(parseCollectionTime(current) || new Date(), language))
    return undefined
  }, [language])
  useEffect(() => {
    if (replacing || preview) return undefined
    const controller = new AbortController()
    const request = { signal: controller.signal }
    loadCollectionOrders(request).then(
      next => { if (!controller.signal.aborted) { setOrders(next); setStatus('ready') } },
      () => { if (!controller.signal.aborted) setStatus('error') },
    )
    loadSampleTypes(request).then(
      next => { if (!controller.signal.aborted) setSampleTypes(next) },
      () => { if (!controller.signal.aborted) setSampleTypes([]) },
    )
    return () => controller.abort()
  }, [attempt, preview, replacing])
  useEffect(() => {
    if (!replacing || replacementPreview) return undefined
    const controller = new AbortController()
    const request = { signal: controller.signal }
    loadReplacementSource(replacementId, request).then(
      next => { if (!controller.signal.aborted) { setSource(next); setStatus(next ? 'ready' : 'ineligible') } },
      () => { if (!controller.signal.aborted) setStatus('error') },
    )
    loadSampleTypes(request).then(
      next => { if (!controller.signal.aborted) setSampleTypes(next) },
      () => { if (!controller.signal.aborted) setSampleTypes([]) },
    )
    return () => controller.abort()
  }, [attempt, replacing, replacementId, replacementPreview])
  useEffect(() => {
    if (!source?.id) return undefined
    setSampleType(source.sampleType || '')
    setContainerType('')
    setCollectedText(formatCollectionTime(new Date(), seenLanguage.current))
    setOutcome(null)
    return undefined
  }, [source])
  const collectedAt = parseCollectionTime(collectedText)
  // Notes and test links are not fields on POST /api/samples. A replacement can
  // still be recorded with the rejected sample id. Regular collection has no
  // visitId on the order list, so that save stays unavailable.
  const ready = replacing ? collectionReady({
    orderId: source?.id,
    sampleType,
    containerType,
    collectedAt,
    requireTests: false,
  }) : false
  function chooseOrder(next) {
    setOrderId(next)
    setBlocked(false)
  }
  async function save(event) {
    event.preventDefault()
    if (!ready || saving || outcome?.confirmed) return
    if (replacing) {
      if (replacementPreview) {
        setOutcome({ error: copy.replacePreview })
        return
      }
      if (!source?.visitId) {
        setOutcome({ error: copy.replaceNoVisit })
        return
      }
      setSaving(true)
      try {
        const saved = await submitReplacement({
          visitId: source.visitId,
          sampleType,
          containerType,
          collectedAt,
          replacesSampleId: source.id,
        })
        if (saved?.confirmed !== true) {
          setOutcome({ error: copy.replaceUnconfirmed })
          return
        }
        setOutcome({ confirmed: true })
        onRecorded?.()
      } catch {
        setOutcome({ error: copy.replaceSaveError })
      } finally {
        setSaving(false)
      }
      return
    }
    if (submitCollection()?.confirmed === true) return
    setBlocked(true)
  }
  const back = <button type="button" className="lab-collect-back" onClick={onBack}>{copy.back}</button>
  return <div className="lab-collect-screen">
    <div className="lab-heading">
      <div>
        <h1 tabIndex={-1} ref={heading}>{replacing ? copy.replaceTitle : copy.collectTitle}</h1>
        <p>{replacing ? copy.replaceSubtitle : copy.collectSubtitle}</p>
        {source && <dl className="lab-replace-source">
          <div><dt>{copy.originalSample}</dt><dd><bdi>{source.barcode || copy.empty}</bdi></dd></div>
          <div><dt>{copy.rejectionReason}</dt><dd>{source.rejectionReason || copy.empty}</dd></div>
        </dl>}
      </div>
    </div>
    {status === 'loading' ? <section className="lab-collect-card"><p className="lab-state" role="status">{replacing ? copy.replaceLoading : copy.collectLoading}</p>{back}</section> : status === 'error' ? <section className="lab-collect-card"><p className="lab-state" role="alert">{replacing ? copy.replaceLoadError : copy.collectLoadError} <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></p>{back}</section> : replacing && !source ? <section className="lab-collect-card"><p className="lab-state" role="status">{copy.replaceIneligible}</p>{back}</section> : !replacing && orders.length === 0 ? <section className="lab-collect-card"><p className="lab-state" role="status">{copy.collectEmpty}</p>{back}</section> : <form className="lab-collect-card" noValidate onSubmit={save}>
      <div className="lab-collect-grid">
        <label className="lab-field">
          <span>{copy.orderAndPatient}</span>
          {replacing ? <input value={orderPatient(source)} readOnly /> : <OrderCombo orders={orders} orderId={orderId} onSelect={chooseOrder} copy={copy} />}
        </label>
        <label className="lab-field">
          <span>{copy.sampleType}</span>
          <input value={sampleType} list={sampleTypes.length ? sampleTypeList : undefined} maxLength={40} autoComplete="off" placeholder={copy.selectSampleType} disabled={outcome?.confirmed || undefined} onChange={event => { setSampleType(event.target.value); setBlocked(false); setOutcome(null) }} />
          {sampleTypes.length > 0 && <datalist id={sampleTypeList}>{sampleTypes.map(type => <option key={type} value={type} />)}</datalist>}
        </label>
        <label className="lab-field">
          <span>{copy.container}</span>
          <input value={containerType} maxLength={60} autoComplete="off" disabled={outcome?.confirmed || undefined} onChange={event => { setContainerType(event.target.value); setBlocked(false); setOutcome(null) }} />
        </label>
        <label className="lab-field">
          <span>{copy.collectionTime}</span>
          <input value={collectedText} autoComplete="off" spellCheck="false" disabled={outcome?.confirmed || undefined} aria-invalid={collectedText.trim() && !collectedAt ? true : undefined} onChange={event => { setCollectedText(event.target.value); setBlocked(false); setOutcome(null) }} onBlur={event => { const parsed = parseCollectionTime(event.target.value); if (parsed) setCollectedText(formatCollectionTime(parsed, language)) }} />
        </label>
      </div>
      <p className="lab-detail-note" id={`${alertId}-fields`} role="status">{copy.collectionFieldsMissing}</p>
      {blocked && <div className="lab-collect-alert" id={alertId} role="alert"><p>{copy.saveBlocked}</p></div>}
      {outcome?.error && <div className="lab-collect-alert" id={alertId} role="alert"><p>{outcome.error}</p></div>}
      {outcome?.confirmed && <div className="lab-collect-success" id={alertId} role="status"><p>{copy.replaceSaved}</p></div>}
      <div className="lab-collect-actions">
        <button type="submit" className="lab-collect" disabled={!ready || saving || outcome?.confirmed || undefined} aria-describedby={`${alertId}-fields${blocked || outcome ? ` ${alertId}` : ''}`}>{replacing ? copy.saveReplacement : copy.saveCollection}</button>
        {back}
      </div>
    </form>}
  </div>
}
