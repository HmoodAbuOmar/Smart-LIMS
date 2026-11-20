import { ArrowUpRight, ClipboardList, Search } from 'lucide-react'
import AdminFilterDropdown from './AdminFilterDropdown.jsx'

export default function AdminOrders({ orders, query, status, page, onQuery, onStatus, onPage, onDetails, copy, local, number, money, date, sectionRef, pagination, loadMessage, retry, choices = ['received', 'processing', 'review', 'completed'] }) {
  const pageSize = 8
  const pages = Math.max(1, pagination?.totalPages ?? Math.ceil(orders.length / pageSize))
  const visible = pagination ? orders : orders.slice((page - 1) * pageSize, page * pageSize)
  return <section ref={sectionRef} className="admin-overview-panel admin-orders-section" tabIndex={-1} aria-labelledby="admin-orders-heading">
    <div className="admin-overview-panel-heading"><div><h3 id="admin-orders-heading"><ClipboardList size={18} aria-hidden="true" />{copy.recent}</h3><p>{copy.recentNote}</p></div><span className="admin-overview-muted">{number(pagination?.totalElements ?? orders.length)} {copy.records}</span></div>
    <div className="admin-order-filters">
      <label className="admin-order-search"><Search size={17} aria-hidden="true" /><input type="search" maxLength={120} aria-label={copy.search} placeholder={copy.searchPlaceholder} value={query} onChange={event => onQuery(event.target.value)} /></label>
      <AdminFilterDropdown label={copy.statusFilter} value={status} onChange={onStatus} options={[{ value: 'all', label: copy.all }, ...choices.map(value => ({ value, label: copy.statuses[value] }))]} />
    </div>
    {loadMessage && (retry ? <p role="alert"><button type="button" onClick={retry}>{loadMessage}</button></p> : <p role="status">{loadMessage}</p>)}
    <div className="admin-overview-table-scroll" role="region" aria-label={copy.recent} tabIndex={0}>
      <table><caption className="admin-overview-sr-only">{copy.recent}</caption><thead><tr>{[copy.order, copy.patient, copy.test, copy.date, copy.amount, copy.status, copy.details].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{visible.map(order => <tr key={order.id}>
          <th scope="row"><bdi>{order.orderNumber || '—'}</bdi></th>
          <td><span className="admin-person-cell"><span className="admin-person-avatar" aria-hidden="true">{local(order.patient).charAt(0)}</span><span>{local(order.patient)}</span></span></td>
          <td>{order.testNames ?? '—'}</td><td><time dateTime={order.date}>{date(order.date)}</time></td>
          <td className="admin-amount">{money(order.amount)}</td><td><span className={`admin-overview-status admin-order-${order.status}`}>{copy.statuses[order.status]}</span></td>
          <td><button type="button" className="admin-overview-text-button" aria-label={`${copy.view} ${order.orderNumber || '—'}`} onClick={event => onDetails(order, event.currentTarget)}>{copy.view}<ArrowUpRight size={14} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table>
      {!orders.length && <p className="admin-overview-empty" role="status">{copy.noOrders}</p>}
    </div>
    <div className="admin-order-pagination"><span>{copy.page} {number(page)} {copy.of} {number(pages)}</span><div><button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>{copy.previous}</button><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{copy.next}</button></div></div>
  </section>
}
