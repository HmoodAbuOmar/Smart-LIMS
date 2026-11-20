import { useCallback, useState } from 'react'
import { portalApi } from '../../services/portalApi.js'
import { usePortalPage } from '../usePortalPage.js'
import { Plus } from 'lucide-react'
import { visitForAppointment } from '../history/historyModel.js'
import ConfirmDialog from './components/CancelAppointmentDialog.jsx'
import { Title, Button, VisitLink, Status, Empty, FilterTabs, PageActions } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Appointments() {
  const { state, t, date, navigate, commit, busy, development } = usePortal(), [tab, setTab] = useState('upcoming'), [cancelId, setCancelId] = useState(null)
  const [page, setPage] = useState(0)
  const load = useCallback((params, options) => portalApi.loadAppointments(state.profile, params, options), [state.profile])
  const { response, retry } = usePortalPage(load, { page, tab: tab.toUpperCase() }, !development)
  const matches = !development ? (response?.data?.content || []).filter(item => tab !== 'upcoming' || !state.appointments.some(saved => saved.id === item.id && saved.status === 'cancelled')) : state.appointments.filter(a => tab === 'upcoming' ? a.status === 'confirmed' && new Date(a.startsAt || `${a.date}T${a.time}`) > new Date() : a.status !== 'confirmed' || new Date(a.startsAt || `${a.date}T${a.time}`) <= new Date()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  return <><Title title="appointments" hint="appointmentsHint"><Button onClick={() => navigate('book')}><Plus size={16} />{t('book')}</Button></Title><FilterTabs options={['upcoming', 'past']} value={tab} onChange={value => { setTab(value); setPage(0) }} /><section className="portal-card">{!development && !response ? <p role="status">{t('loading')}</p> : response?.error ? <Empty title="unavailable" action="retry" onClick={retry} /> : matches.length ? <div className="portal-table-wrap"><table><thead><tr>{['date', 'type', 'status', 'actions'].map(k => <th key={k}>{t(k)}</th>)}</tr></thead><tbody>{matches.map(a => <tr key={a.id}><th scope="row">{date(a.date)}<small className="portal-block"><bdi>{a.time}</bdi></small></th><td>{development ? t(a.type) : a.type}</td><td><Status value={a.status} /></td><td><VisitLink visit={visitForAppointment(state, a.id)} />{(tab === 'upcoming' || !development) && <div className="portal-row-actions">{(!development || a.tests?.length > 0) && <Button secondary onClick={() => navigate(`appointments/${a.id}`)}>{t('viewBooking')}</Button>}{(development || a.canReschedule) && <Button secondary onClick={() => navigate(`book?reschedule=${encodeURIComponent(a.id)}`)}>{t('reschedule')}</Button>}{(development || a.canCancel) && <button className="portal-cancel" onClick={() => setCancelId(a.id)}>{t('cancel')}</button>}</div>}</td></tr>)}</tbody></table></div> : <Empty title="noAppointments" action="book" onClick={() => navigate('book')} />}<PageActions data={response?.data} page={page} onChange={setPage} /></section>{cancelId && <ConfirmDialog busy={busy} onClose={() => setCancelId(null)} onConfirm={async () => { if (await commit({ type: 'CANCEL', id: cancelId }, 'cancelledNotice')) { setCancelId(null); if (!development) retry() } }} />}</>
}
