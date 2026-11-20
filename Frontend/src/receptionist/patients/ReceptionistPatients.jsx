import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Link, Link2Off, Plus, Search, Users, X } from 'lucide-react'
import AddPatientDrawer from './AddPatientDrawer.jsx'
import { patientsCopy } from './patientsCopy.js'
import { displayPatientName, linkStatus, PAGE_SIZE } from './patientsModel.js'
import { receptionistPatientsService } from './patientsService.js'
import './patients.css'

function formatBirthDate(value, language) { return value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-PS' : 'en-GB', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${value}T12:00:00Z`)) : '—' }
export default function ReceptionistPatients({ service = receptionistPatientsService, onSelect, selectedPatientId, selectionLabel, selectedLabel, onCreated, addHint }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = patientsCopy[language]
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0 })
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saved, setSaved] = useState(null)
  const addButton = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const result = await service.list({ search, page, size: PAGE_SIZE, sort: 'createdAt,desc' }, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (!Array.isArray(result.content) || !Number.isInteger(result.totalElements) || !Number.isInteger(result.totalPages)) throw new Error('Invalid patient page')
        const lastPage = Math.max(0, result.totalPages - 1)
        if (page > lastPage) { setPage(lastPage); return }
        setData(result); setState('ready')
      } catch (error) { if (!controller.signal.aborted) setState(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error') }
    }
    void load()
    return () => controller.abort()
  }, [search, page, attempt, service])
  function changeSearch(value) { setState('loading'); setSearch(value); setPage(0) }
  function changePage(value) { setState('loading'); setPage(value) }
  const number = value => value.toLocaleString(language)
  const from = data.totalElements ? page * PAGE_SIZE + 1 : 0
  const to = Math.min((page + 1) * PAGE_SIZE, data.totalElements)
  const columns = ['file', 'name', 'phone', 'dob', 'account', 'actions']
  return <section className="r02-patients" aria-labelledby="r02-title">
    <header className="r02-heading">{onSelect ? <h2 id="r02-title">{selectionLabel}</h2> : <h1 id="r02-title">{copy.title}</h1>}</header>
    {saved && <div className="r02-toast" role="status">{copy.saved}: {displayPatientName(saved, language)} — <bdi>{saved.patientNumber}</bdi><button type="button" aria-label={copy.close} onClick={() => setSaved(null)}><X size={16} /></button></div>}
    <div className="r02-card">
      <div className="r02-toolbar"><label className="r02-search"><Search size={18} aria-hidden="true" /><input id="r02-search" type="search" aria-label={copy.search} placeholder={copy.search} value={search} maxLength={120} onChange={event => changeSearch(event.target.value)} /></label>{onSelect && <button type="button" ref={addButton} className="r02-primary r02-add" onClick={() => setDrawerOpen(true)}><Plus size={16} aria-hidden="true" />{copy.add}</button>}</div>
      <div aria-busy={state === 'loading'}>
        {state !== 'ready' ? <div className="r02-state" role={state === 'loading' ? 'status' : 'alert'}><Users size={25} aria-hidden="true" /><p>{copy[state]}</p>{state === 'error' && <button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button>}</div> : !data.content.length ? <div className="r02-state" role="status"><Users size={25} aria-hidden="true" /><p>{search.trim() ? copy.noResults : copy.empty}</p>{search.trim() && addHint && <p className="r05-add-hint">{addHint}</p>}{search.trim() && <button type="button" onClick={() => changeSearch('')}>{copy.clear}</button>}</div> : <div className="r02-table-container"><table role="table"><thead role="rowgroup"><tr role="row">{columns.map(column => <th scope="col" key={column} role="columnheader">{copy[column]}</th>)}</tr></thead><tbody role="rowgroup">{data.content.map(patient => {
          const status = linkStatus(patient)
          const AccountIcon = status === 'linked' ? Link : Link2Off
          return <tr key={patient.id} role="row">{[<bdi key="file">{patient.patientNumber}</bdi>, displayPatientName(patient, language), <bdi key="phone">{patient.phoneNumber || '—'}</bdi>, formatBirthDate(patient.dateOfBirth, language), <span key="account" className={`r02-badge r02-${status}`}><AccountIcon size={13} aria-hidden="true" />{copy[status === 'unavailable' ? 'unavailableStatus' : status]}</span>, ...(onSelect ? [<button type="button" key="select" className="r05-select-patient" aria-pressed={patient.id === selectedPatientId} onClick={() => onSelect(patient)}>{patient.id === selectedPatientId ? selectedLabel : selectionLabel}</button>] : [<button type="button" key="open" className="r02-open-file" aria-label={`${copy.openFile}: ${displayPatientName(patient, language)}`} onClick={() => { const prefix = window.location.hash.startsWith('#/__receptionist') ? '/__receptionist' : '/receptionist'; window.location.hash = `${prefix}/walk-in?${new URLSearchParams({ patientId: patient.id, from: 'patients', tab: 'details' })}` }}><FolderOpen size={14} aria-hidden="true" />{copy.openFile}</button>])].map((value, index) => <td key={columns[index]} role="cell"><span className="r02-mobile-label" aria-hidden="true">{copy[columns[index]]}</span><div>{value}</div></td>)}</tr>
        })}</tbody></table></div>}
      </div>
      {state === 'ready' && <footer className="r02-pagination"><span role="status">{copy.showing(number(from), number(to), number(data.totalElements))}</span><nav aria-label={copy.pagination}><button type="button" disabled={page === 0} onClick={() => changePage(page - 1)}>{copy.previous}</button>{Array.from({ length: data.totalPages }, (_, index) => <button type="button" key={index} aria-label={`${copy.page} ${number(index + 1)}`} aria-current={page === index ? 'page' : undefined} onClick={() => changePage(index)}>{number(index + 1)}</button>)}<button type="button" disabled={page >= data.totalPages - 1} onClick={() => changePage(page + 1)}>{copy.next}</button></nav></footer>}
    </div>
    {onSelect && drawerOpen && <AddPatientDrawer language={language} copy={copy} service={service} opener={addButton} onClose={() => setDrawerOpen(false)} onSaved={patient => { if (onCreated) { onCreated(patient); return } setSaved(patient); if (onSelect) { setSearch(patient.patientNumber); setPage(0) } setDrawerOpen(false); setState('loading'); setAttempt(value => value + 1) }} />}
  </section>
}
