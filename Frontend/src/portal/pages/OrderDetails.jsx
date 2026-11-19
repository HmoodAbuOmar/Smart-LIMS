import { useState } from 'react'
import ConfirmDialog from '../booking/components/CancelAppointmentDialog.jsx'
import { ArrowLeft, Check } from 'lucide-react'
import { visitForOrder } from '../history/historyModel.js'
import { Title, Button, VisitLink, Status, Empty } from '../components/PortalUi.jsx'
import { usePatientRecord } from '../usePatientRecord.js'
import { usePortal } from '../PortalContext.js'

export default function OrderDetails({ id }) {
  const { state, t, local, money, date, navigate, development, commit, busy } = usePortal()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const listed = state.orders.find(o => o.id === id)
  const loaded = usePatientRecord('order', listed?.items || development ? null : id, state.profile, development)
  const order = development || listed?.items ? listed : loaded?.record
  if (!development && !listed?.items && !loaded) return <p role="status">{t('loading')}</p>
  if (!order) return <Empty title="notFound" action="orders" onClick={() => navigate('orders')} />
  return <><Title title="order"><Button secondary onClick={() => navigate('orders')}><ArrowLeft size={16} />{t('orders')}</Button></Title><VisitLink visit={visitForOrder(state, id)} /><section className="portal-card"><div className="portal-card-heading"><div><h2><bdi>{order.number || (development ? order.id : '—')}</bdi></h2><p>{date(order.date)}</p></div><Status value={order.status} /></div>{development && <><ol className="portal-timeline">{['placed', 'collected', 'inLab', 'completed'].map((key, index) => <li key={key} className={index <= order.stage && order.status !== 'cancelled' ? 'is-done' : ''} aria-current={index === order.stage ? 'step' : undefined}><span>{index <= order.stage && order.status !== 'cancelled' ? <Check size={16} /> : index + 1}</span><strong>{t(key)}</strong></li>)}</ol><div className="portal-metrics"><span>{t('sampleStatus')}: <strong>{t(order.stage >= 1 ? 'collected' : 'notYet')}</strong></span><span>{t('processing')}: <strong>{t(order.status)}</strong></span></div></>}<div className="portal-metrics"><span>{t('total')}: <strong>{money(order.total)}</strong></span></div><h3>{t('count')}</h3><div className="portal-table-wrap"><table><thead><tr><th>{t('test')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead><tbody>{order.tests.map(id => { const item = order.items?.find(row => row.labTestId === id), test = state.tests.find(t => t.id === id), result = state.results.find(r => r.orderId === order.id && (item ? r.orderItemId === item.id : r.testId === id) && r.status === 'published'); return <tr key={id}><th scope="row">{item?.testName || local(test?.name)}</th><td><Status value={result ? 'completed' : order.status} /></td><td><Button secondary disabled={!result} onClick={() => navigate(`results/${result.id}`)}>{t('viewResult')}</Button></td></tr> })}</tbody></table></div>{!development && order.canCancel && <Button secondary disabled={busy} onClick={() => setConfirmCancel(true)}>{t('cancelOrderAction')}</Button>}{order.status === 'pending' && <Button onClick={() => navigate(`book?order=${encodeURIComponent(id)}`)}>{t('book')}</Button>}</section>{confirmCancel && <ConfirmDialog order busy={busy} onClose={() => setConfirmCancel(false)} onConfirm={async () => { if (await commit({ type: 'CANCEL_ORDER', id }, 'orderCancelled')) setConfirmCancel(false) }} />}</>
}
