import { useState } from 'react'
import { Plus } from 'lucide-react'
import { visitForAppointment } from '../history/historyModel.js'
import ConfirmDialog from './components/CancelAppointmentDialog.jsx'
import { Title, Button, VisitLink, Status, Empty, FilterTabs } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Appointments() {
  const { state, t, date, navigate, commit, busy } = usePortal(), [tab, setTab] = useState('upcoming'), [cancelId, setCancelId] = useState(null)
  const matches = state.appointments.filter(a => tab === 'upcoming' ? a.status === 'confirmed' && new Date(`${a.date}T${a.time}`) > new Date() : a.status !== 'confirmed' || new Date(`${a.date}T${a.time}`) <= new Date()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  return <><Title title="appointments" hint="appointmentsHint"><Button onClick={() => navigate('book')}><Plus size={16} />{t('book')}</Button></Title><FilterTabs options={['upcoming', 'past']} value={tab} onChange={setTab} /><section className="portal-card">{matches.length ? <div className="portal-table-wrap"><table><thead><tr>{['date', 'type', 'status', 'actions'].map(k => <th key={k}>{t(k)}</th>)}</tr></thead><tbody>{matches.map(a => <tr key={a.id}><th scope="row">{date(a.date)}<small className="portal-block"><bdi>{a.time}</bdi></small></th><td>{t(a.type)}</td><td><Status value={a.status} /></td><td><VisitLink visit={visitForAppointment(state, a.id)} />{tab === 'upcoming' && <div className="portal-row-actions">{a.tests?.length > 0 && <Button secondary onClick={() => navigate(`appointments/${a.id}`)}>{t('viewBooking')}</Button>}<Button secondary onClick={() => navigate(`book?reschedule=${encodeURIComponent(a.id)}`)}>{t('reschedule')}</Button><button className="portal-cancel" onClick={() => setCancelId(a.id)}>{t('cancel')}</button></div>}</td></tr>)}</tbody></table></div> : <Empty title="noAppointments" action="book" onClick={() => navigate('book')} />}</section>{cancelId && <ConfirmDialog busy={busy} onClose={() => setCancelId(null)} onConfirm={async () => { if (await commit({ type: 'CANCEL', id: cancelId }, 'cancelledNotice')) setCancelId(null) }} />}</>
}
