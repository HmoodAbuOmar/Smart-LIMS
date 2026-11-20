import { useEffect, useRef, useState } from 'react'
import { ScrollText, Search, X } from 'lucide-react'
import { auditLogCopy } from './auditLogCopy.js'
import { filterEvents, schedulingZone, text } from './auditLogModel.js'
import './auditLog.css'

function EventDrawer({ event, language, copy, onClose, opener }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [opener])
  return <dialog ref={dialog} className="al-drawer" dir={language === 'ar' ? 'rtl' : 'ltr'} aria-labelledby="al-details-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h3 id="al-details-title">{copy.event}</h3><button type="button" autoFocus aria-label={copy.close} onClick={onClose}><X size={19} /></button></header>
    <dl>{[
      [copy.timestamp, formatTime(event.timestamp, language)], [copy.actor, text(event, 'actor', language) || '—'], [copy.role, copy[event.role] || '—'],
      [copy.action, copy[event.action] || event.action], [copy.entity, text(event, 'entity', language)], [copy.entityId, <bdi key="entity-id">{event.entityId || '—'}</bdi>],
      [copy.requestId, <bdi key="request-id">{event.requestId || '—'}</bdi>], [copy.details, text(event, 'details', language)],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </dialog>
}
function formatTime(timestamp, language) {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { timeZone: schedulingZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
}
export default function AdminAuditLog({ language = 'en', service }) {
  const copy = auditLogCopy[language]
  const [serverPage, setServerPage] = useState(null)
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [filters, setFilters] = useState({ from: '', to: '', actor: '', action: '', query: '' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const invalid = filters.from && filters.to && filters.from > filters.to
  const serverQuery = JSON.stringify(service.live ? {
    page: page - 1, size: 8, fromDate: filters.from || undefined, toDate: filters.to || undefined,
    actorId: filters.actor || undefined, action: filters.action || undefined, search: filters.query.trim() || undefined,
  } : {})
  useEffect(() => {
    if (service.live && invalid) return
    const controller = new AbortController()
    service.load(JSON.parse(serverQuery), { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      if (service.live) setServerPage({ key: serverQuery, ...data })
      setEvents(service.live ? data.content : data)
      setStatus('ready')
    }, error => { if (!controller.signal.aborted) setStatus(error.code === 'AUDIT_UNAVAILABLE' ? 'unavailable' : 'error') })
    return () => controller.abort()
  }, [attempt, service, serverQuery, invalid])
  function update(key, value) { setFilters(current => ({ ...current, [key]: value })); setPage(1) }
  const filtered = invalid ? [] : filterEvents(events, filters)
  const pages = Math.max(1, service.live ? serverPage?.totalPages || 1 : Math.ceil(filtered.length / 8))
  const currentPage = Math.min(page, pages)
  const rows = service.live ? (serverPage?.key === serverQuery && !invalid ? events : []) : filtered.slice((currentPage - 1) * 8, currentPage * 8)
  const actors = service.live ? (serverPage?.actors || []).map(actor => ({ actorId: actor.id, actorEn: actor.name, actorAr: actor.name })) : [...new Map(events.map(event => [event.actorId, event])).values()]
  const columns = [copy.timestamp, copy.actor, copy.action, copy.entity, copy.details]
  function open(event, element) { setSelected({ event, opener: element }) }
  return <section className="admin-audit-log" aria-labelledby="al-title" aria-busy={status === 'loading'}>
    <header className="al-heading"><span><ScrollText size={23} aria-hidden="true" /></span><div><h2 id="al-title">{copy.title}</h2><p>{copy.subtitle}</p></div></header>
    <div className="al-panel">
      <div className="al-filters">
        <fieldset><legend>{copy.dateRange}</legend><label>{copy.from}<input id="al-from" type="date" value={filters.from} aria-invalid={!!invalid} aria-describedby={invalid ? 'al-date-error' : undefined} onChange={event => update('from', event.target.value)} /></label><label>{copy.to}<input id="al-to" type="date" value={filters.to} aria-invalid={!!invalid} aria-describedby={invalid ? 'al-date-error' : undefined} onChange={event => update('to', event.target.value)} /></label></fieldset>
        <label>{copy.actor}<select id="al-actor" value={filters.actor} onChange={event => update('actor', event.target.value)}><option value="">{copy.all}</option>{actors.map(actor => <option key={actor.actorId} value={actor.actorId}>{text(actor, 'actor', language)}</option>)}</select></label>
        <label>{copy.action}<select id="al-action" value={filters.action} onChange={event => update('action', event.target.value)}><option value="">{copy.all}</option>{(service.live ? serverPage?.actions || [] : ['CREATED', 'UPDATED', 'DELETED']).map(action => <option key={action} value={action}>{copy[action] || action}</option>)}</select></label>
      </div>
      {invalid && <p id="al-date-error" className="al-error" role="alert">{copy.invalidDates}</p>}
      <label className="al-search"><Search size={18} aria-hidden="true" /><input type="search" id="al-search" maxLength={120} aria-label={copy.search} placeholder={copy.search} value={filters.query} onChange={event => update('query', event.target.value)} /></label>
      <p className="al-timezone">{copy.timezone}</p>
      {status !== 'ready' ? <div className="al-state" role={status === 'loading' ? 'status' : 'alert'}><ScrollText aria-hidden="true" /><p>{copy[status]}</p>{status === 'error' && <button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button>}</div> : !rows.length ? <div className="al-state" role="status"><ScrollText aria-hidden="true" /><p>{events.length ? copy.noResults : copy.empty}</p>{events.length > 0 && <button type="button" onClick={() => { setFilters({ from: '', to: '', actor: '', action: '', query: '' }); setPage(1) }}>{copy.clear}</button>}</div> : <div className="al-table-container"><table><thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(event => <tr key={event.id} tabIndex={0} aria-label={`${copy.open}: ${text(event, 'entity', language)} ${event.entityId}`} aria-haspopup="dialog" onClick={click => open(event, click.currentTarget)} onKeyDown={key => { if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); open(event, key.currentTarget) } }}>
        {[formatTime(event.timestamp, language), text(event, 'actor', language) || '—', <span key="action" className={`al-badge al-${event.action}`}>{copy[event.action] || event.action}</span>, <span key="entity">{text(event, 'entity', language)}<small><bdi>{event.entityId}</bdi></small></span>, text(event, 'details', language)].map((value, index) => <td key={columns[index]}><span className="al-mobile-label" aria-hidden="true">{columns[index]}</span><div>{value}</div></td>)}
      </tr>)}</tbody></table></div>}
      {status === 'ready' && <footer className="al-footer"><span role="status">{(service.live ? serverPage?.key === serverQuery && !invalid ? serverPage.totalElements : 0 : filtered.length).toLocaleString(language)} {copy.results}</span><nav aria-label={`${copy.title} ${copy.page}`}><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{copy.previous}</button><span>{copy.page} {currentPage.toLocaleString(language)} {copy.of} {pages.toLocaleString(language)}</span><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{copy.next}</button></nav></footer>}
    </div>
    {selected && <EventDrawer event={selected.event} language={language} copy={copy} opener={selected.opener} onClose={() => setSelected(null)} />}
  </section>
}
