import { ArrowRight, Bell, CalendarDays, ClipboardList, FileText, FlaskConical } from 'lucide-react'
import OrderTable from '../components/OrderTable.jsx'
import ResultList from '../components/ResultList.jsx'
import { Button, Status, Empty, Card } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'
import { HealthTrendsPreview } from '../history/MedicalHistory.jsx'

export default function Dashboard() {
  const api = usePortal()
  const { t, state, name, number, navigate, local, date } = usePortal()
  const upcoming = state.appointments.filter(a => a.status === 'confirmed' && new Date(`${a.date}T${a.time}`) > new Date()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  const published = state.results.filter(r => r.status === 'published')
  const summaries = [['totalOrders', state.orders.length, ClipboardList, 'orders'], ['upcomingAppointments', upcoming.length, CalendarDays, 'appointments'], ['availableResults', published.length, FileText, 'results'], ['unread', state.notifications.filter(n => !n.read).length, Bell, 'notifications']]
  return <>
    <section className="portal-welcome"><div><p>{t('welcome')}</p><h1 className="portal-page-title" tabIndex={-1}>{name}</h1><p>{t('welcomeHint')}</p></div></section>
    <div className="portal-stats">{summaries.map(([label, count, Icon, target]) => <button key={label} className="portal-stat" onClick={() => navigate(target)}><span className="portal-icon"><Icon size={23} /></span><strong>{number(count)}</strong><span>{t(label)}</span><small>{t('viewAll')} <ArrowRight size={12} /></small></button>)}</div>
    <div className="portal-quick"><h2>{t('quick')}</h2><div>{[['browse', 'tests', FlaskConical], ['book', 'book', CalendarDays], ['orders', 'orders', ClipboardList], ['results', 'results', FileText]].map(([key, route, Icon]) => <Button key={key} secondary onClick={() => navigate(route)}><Icon size={16} />{t(key)}</Button>)}</div></div>
    <HealthTrendsPreview api={api} />
    <div className="portal-two-col"><Card title="recentOrders" action={<button className="portal-text" onClick={() => navigate('orders')}>{t('viewAll')}</button>}><OrderTable orders={[...state.orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)} /></Card><Card title="nextAppointment">{upcoming[0] ? <div className="portal-next"><CalendarDays size={30} /><h3>{date(upcoming[0].date)}</h3><strong><bdi>{upcoming[0].time}</bdi></strong><p>{t(upcoming[0].type)}</p><Status value={upcoming[0].status} /><Button onClick={() => navigate('appointments')}>{t('appointments')}</Button></div> : <Empty title="noAppointments" action="book" onClick={() => navigate('book')} />}</Card></div>
    <div className="portal-two-col"><Card title="latestResults" action={<button className="portal-text" onClick={() => navigate('results')}>{t('viewAll')}</button>}>{published.length ? <ResultList results={published.slice(0, 3)} /> : <Empty title="noResults" />}</Card><Card title="popular" action={<button className="portal-text" onClick={() => navigate('tests')}>{t('viewAll')}</button>}><div className="portal-popular">{state.tests.slice(0, 4).map(test => <button key={test.id} onClick={() => navigate(`tests/${test.id}`)}><span className="portal-icon"><FlaskConical size={19} /></span><span>{local(test.name)}</span></button>)}</div></Card></div>
  </>
}
