import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ContactRound, Eye, Link2, Pencil, Plus, Search, Unlink2 } from 'lucide-react'
import AdminPatientForm from './AdminPatientForm.jsx'
import AdminPatientAvatar from './AdminPatientAvatar.jsx'
import { adminPatientsCopy } from './adminPatientsCopy.js'
import { adminPatientsService } from './adminPatientsService.js'
import { patientFinancials, patientName, searchPatients } from './adminPatientsModel.js'
import { formatCurrency } from '../../utils/currency.js'
import './adminPatients.css'

function Status({ value, labels }) { return <span className={`ap-badge ap-status-${value.toLowerCase()}`}>{labels[value]}</span> }
function AccountStatus({ patient, copy }) {
  const Icon = patient.linkedAccountId ? Link2 : Unlink2
  return <span className={`ap-badge ap-account-status ${patient.linkedAccountId ? 'ap-linked' : 'ap-unlinked'}`}><Icon size={12} aria-hidden="true" />{patient.linkedAccountId ? copy.linked : copy.unlinked}</span>
}
function Demographics({ patient, copy, date }) {
  return <dl className="ap-demographics">{['fileNumber', 'dateOfBirth', 'gender', 'phone', 'address', 'account'].map(field => <div key={field}>
    <dt>{copy[field]}</dt><dd>{field === 'account' ? <AccountStatus patient={patient} copy={copy} /> : field === 'dateOfBirth' ? date(patient[field]) : field === 'gender' ? copy.genders[patient.gender] : <bdi className={field === 'fileNumber' ? 'ap-file-number' : undefined}>{patient[field] || copy.missing}</bdi>}</dd>
  </div>)}</dl>
}

export default function AdminPatients({ language, onToggleLanguage, service = adminPatientsService }) {
  const copy = adminPatientsCopy[language]
  const rtl = language === 'ar'
  const [data, setData] = useState({ patients: [], orders: [], appointments: [], transactions: [] })
  const [loadState, setLoadState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(7)
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('overview')
  const [editor, setEditor] = useState(null)
  const [notice, setNotice] = useState(false)
  const profileHeading = useRef(null)
  const listHeading = useRef(null)
  const returnTo = useRef(null)
  const wasProfile = useRef(false)
  const number = value => new Intl.NumberFormat(language).format(value)
  const date = value => value ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : copy.missing
  const money = value => formatCurrency(value, language)

  useEffect(() => {
    let active = true
    service.load().then(result => { if (active) { setData(result); setLoadState('ready') } }).catch(() => { if (active) setLoadState('error') })
    return () => { active = false }
  }, [service, attempt])

  useEffect(() => {
    if (selectedId) profileHeading.current?.focus()
    else if (wasProfile.current) {
      if (returnTo.current?.isConnected) returnTo.current.focus()
      else listHeading.current?.focus()
    }
    wasProfile.current = Boolean(selectedId)
  }, [selectedId])
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(false), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const filtered = useMemo(() => searchPatients(data.patients, query), [data.patients, query])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pages)
  const patients = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selected = data.patients.find(patient => patient.id === selectedId)
  const orders = data.orders.filter(order => order.patientId === selectedId)
  const appointments = data.appointments.filter(item => item.patientId === selectedId)
  const financials = patientFinancials(selectedId, data.orders, data.transactions)
  const tabs = ['overview', 'orders', 'appointments', 'financial']

  function openProfile(patient, trigger) { returnTo.current = trigger; setSelectedId(patient.id); setTab('overview'); setNotice(false) }
  function saved(patient) {
    setData(current => ({ ...current, patients: current.patients.some(item => item.id === patient.id) ? current.patients.map(item => item.id === patient.id ? patient : item) : [patient, ...current.patients] }))
    if (editor?.mode === 'add') { setQuery(''); setPage(1) }
    setEditor(null)
    setNotice(true)
  }

  return <section className="admin-patients" aria-label={copy.title}>
    <div className="ap-heading"><div className="ap-heading-copy"><span className="ap-title-icon" aria-hidden="true"><ContactRound size={23} /></span><div><h2 ref={listHeading} tabIndex={-1}>{copy.title}</h2><p>{copy.description}</p></div></div>
      {!selected && <button type="button" className="ap-primary" disabled={loadState !== 'ready'} onClick={() => { setNotice(false); setEditor({ mode: 'add' }) }}><Plus size={17} aria-hidden="true" />{copy.add}</button>}
    </div>
    {notice && <p className="ap-notice" role="status">{copy.saved}</p>}
    {loadState === 'loading' ? <div className="ap-card ap-empty" role="status" aria-busy="true">{copy.loading}</div> : loadState === 'error' ? <div className="ap-card ap-empty"><p role="alert">{copy.error}</p><button type="button" onClick={() => { setLoadState('loading'); setAttempt(value => value + 1) }}>{copy.retry}</button></div> : selected ? <>
      <div className="ap-profile-nav"><button type="button" onClick={() => setSelectedId(null)}>{rtl ? <ArrowRight size={16} aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}{copy.back}</button></div>
      <section className="ap-card ap-summary" aria-labelledby="patient-profile-name"><div className="ap-summary-heading"><AdminPatientAvatar patient={selected} language={language} large /><div><h3 id="patient-profile-name" ref={profileHeading} tabIndex={-1}>{patientName(selected, language)}</h3><bdi className="ap-file-number">{selected.fileNumber}</bdi></div><button type="button" className="ap-primary" onClick={() => { setNotice(false); setEditor({ mode: 'edit', patient: selected }) }}><Pencil size={16} aria-hidden="true" />{copy.edit}</button></div>
        <Demographics patient={selected} copy={copy} date={date} /><p className="ap-guidance">{copy.guidance}</p>
      </section>
      <section className="ap-card ap-profile-content">
        <div className="ap-tabs" role="tablist" aria-label={copy.view}>{tabs.map((key, index) => <button type="button" key={key} role="tab" id={`patient-tab-${key}`} aria-controls={`patient-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
          let next
          if (event.key === 'Home') next = 0
          if (event.key === 'End') next = tabs.length - 1
          if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + tabs.length) % tabs.length
          if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + tabs.length) % tabs.length
          if (next !== undefined) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`patient-tab-${tabs[next]}`)?.focus() }
        }}>{copy[key]}</button>)}</div>
        <div role="tabpanel" id={`patient-panel-${tab}`} aria-labelledby={`patient-tab-${tab}`} tabIndex={0} className="ap-tab-content">
          {tab === 'overview' && <><h3>{copy.overview}</h3><p className="ap-profile-fullname">{patientName(selected, language)}</p><Demographics patient={selected} copy={copy} date={date} /></>}
          {tab === 'orders' && <><div className="ap-section-heading"><h3>{copy.orders}</h3><button type="button" disabled aria-describedby="patient-order-unavailable">{copy.newOrder}</button></div><p id="patient-order-unavailable" className="ap-muted">{copy.orderUnavailable}</p>
            {!orders.length ? <p className="ap-empty">{copy.noOrders}</p> : <div className="ap-table-scroll" tabIndex={0} role="region" aria-label={copy.orders}><table><caption className="ap-sr-only">{copy.orders}</caption><thead><tr>{[copy.orderNumber, copy.date, copy.status, copy.total, copy.actions].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{orders.map(order => <tr key={order.id}><th scope="row"><bdi>{order.number}</bdi></th><td>{date(order.date)}</td><td><Status value={order.status} labels={copy.orderStatuses} /></td><td><bdi>{money(order.total)}</bdi></td><td><button type="button" disabled aria-describedby="patient-order-unavailable">{copy.openOrder}</button></td></tr>)}</tbody></table></div>}</>}
          {tab === 'appointments' && <><h3>{copy.appointments}</h3>{!appointments.length ? <p className="ap-empty">{copy.noAppointments}</p> : <div className="ap-table-scroll" tabIndex={0} role="region" aria-label={copy.appointments}><table><caption className="ap-sr-only">{copy.appointments}</caption><thead><tr>{[copy.date, copy.orderNumber, copy.status].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{appointments.map(item => <tr key={item.id}><td><time dateTime={`${item.date}T${item.time}`}>{date(item.date)} · <bdi>{item.time}</bdi></time></td><td><bdi>{data.orders.find(order => order.id === item.orderId)?.number || copy.missing}</bdi></td><td><Status value={item.status} labels={copy.appointmentStatuses} /></td></tr>)}</tbody></table></div>}</>}
          {tab === 'financial' && <><h3>{copy.financial}</h3>{financials.available ? <><dl className="ap-financial">{['charges', 'payments', 'outstanding'].map(key => <div key={key}><dt>{copy[key]}</dt><dd><bdi>{money(financials[key])}</bdi></dd></div>)}</dl><p className="ap-muted">{copy.financeNote}</p></> : <p className="ap-empty">{copy.noFinancial}</p>}</>}
        </div>
      </section>
    </> : <>
      <div className="ap-card ap-list-card"><div className="ap-toolbar"><label className="ap-search"><Search size={18} aria-hidden="true" /><span className="ap-sr-only">{copy.search}</span><input type="search" placeholder={copy.search} value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /></label><p role="status">{copy.results}: <strong>{number(filtered.length)}</strong></p></div>
      <div className="ap-table-scroll" role="region" aria-label={copy.title} tabIndex={0}><table><caption className="ap-sr-only">{copy.title}</caption><thead><tr>{['fileNumber', 'fullName', 'dateOfBirth', 'gender', 'phone', 'account', 'actions'].map(key => <th scope="col" key={key}>{copy[key]}</th>)}</tr></thead><tbody>{patients.map(patient => <tr key={patient.id}>
        <th scope="row"><bdi className="ap-file-number">{patient.fileNumber}</bdi></th><td className="ap-name"><span className="ap-person"><AdminPatientAvatar patient={patient} language={language} /><span>{patientName(patient, language)}</span></span></td><td className="ap-date-cell">{date(patient.dateOfBirth)}</td><td>{copy.genders[patient.gender]}</td><td className="ap-phone-cell"><bdi>{patient.phone || copy.missing}</bdi></td><td><AccountStatus patient={patient} copy={copy} /></td><td><div className="ap-row-actions"><button type="button" aria-label={`${copy.view}: ${patientName(patient, language)}, ${patient.fileNumber}`} onClick={event => openProfile(patient, event.currentTarget)}><Eye size={15} aria-hidden="true" />{copy.view}</button><button type="button" aria-label={`${copy.edit}: ${patientName(patient, language)}, ${patient.fileNumber}`} onClick={() => { setNotice(false); setEditor({ mode: 'edit', patient }) }}><Pencil size={14} aria-hidden="true" />{copy.editAction}</button></div></td>
      </tr>)}</tbody></table></div>
        {!patients.length && <div className="ap-empty" role="status"><p>{data.patients.length ? copy.noResults : copy.empty}</p>{query && <button type="button" onClick={() => { setQuery(''); setPage(1) }}>{copy.clear}</button>}</div>}
        <div className="ap-pagination"><label>{copy.pageSize}<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>{[7, 10, 25].map(size => <option value={size} key={size}>{number(size)}</option>)}</select></label><nav aria-label={copy.title}><button type="button" disabled={currentPage <= 1} aria-label={copy.previous} onClick={() => setPage(currentPage - 1)}>{rtl ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button><span>{copy.page} {number(currentPage)} {copy.of} {number(pages)}</span><button type="button" disabled={currentPage >= pages} aria-label={copy.next} onClick={() => setPage(currentPage + 1)}>{rtl ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</button></nav></div>
      </div>
    </>}
    {editor && <AdminPatientForm patient={editor.patient} language={language} onToggleLanguage={onToggleLanguage} copy={copy} service={service} onSaved={saved} onClose={() => setEditor(null)} />}
  </section>
}
