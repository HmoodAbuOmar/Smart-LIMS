import { visitForOrder } from '../historyModel.js'
import { Button, VisitLink, Status } from './PortalUi.jsx'
import { usePortal } from '../PortalContext.js'

export default function OrderTable({ orders }) { const { t, state, date, money, number, navigate } = usePortal(); return <div className="portal-table-wrap" tabIndex={0}><table><caption className="portal-sr-only">{t('orders')}</caption><thead><tr>{['orderNumber', 'date', 'count', 'amount', 'status', 'actions'].map(k => <th key={k} scope="col">{t(k)}</th>)}</tr></thead><tbody>{orders.map(order => <tr key={order.id}><th scope="row"><bdi>{order.id}</bdi></th><td>{date(order.date)}</td><td>{number(order.tests.length)}</td><td>{money(order.total)}</td><td><Status value={order.status} /></td><td><Button secondary onClick={() => navigate(`orders/${order.id}`)}>{t('view')}</Button> <VisitLink visit={visitForOrder(state, order.id)} /></td></tr>)}</tbody></table></div> }
