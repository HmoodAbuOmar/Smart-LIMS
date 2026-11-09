import { useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, FileText } from 'lucide-react'
import { Title, Button, Empty, FilterTabs } from '../components/PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function Notifications() {
  const { state, t, datetime, navigate, dispatch } = usePortal(), [filter, setFilter] = useState('all')
  const matches = state.notifications.filter(n => filter === 'all' || (filter === 'unread' ? !n.read : n.category === filter))
  return <><Title title="notifications" hint="notificationsHint"><Button secondary disabled={!state.notifications.some(n => !n.read)} onClick={() => dispatch({ type: 'READ', id: 'all' })}><CheckCircle2 size={16} />{t('markAll')}</Button></Title><FilterTabs options={['all', 'unread', 'orders', 'results', 'appointments', 'system']} value={filter} onChange={setFilter} /><section className="portal-card portal-notifications">{matches.length ? matches.map(n => <article key={n.id} className={n.read ? '' : 'is-unread'}><span className="portal-icon">{n.category === 'results' ? <FileText size={20} /> : n.category === 'appointments' ? <CalendarDays size={20} /> : <Bell size={20} />}</span><button className="portal-notification-link" onClick={() => { dispatch({ type: 'READ', id: n.id }); navigate(n.target) }}><strong>{t(n.key)}</strong><small>{t(n.category)} · {datetime(n.date)}</small></button>{!n.read && <button className="portal-text" onClick={() => dispatch({ type: 'READ', id: n.id })}>{t('markRead')}</button>}</article>) : <Empty onClick={() => setFilter('all')} />}</section></>
}
