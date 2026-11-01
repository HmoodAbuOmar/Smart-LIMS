import { ArrowUpRight, Search } from 'lucide-react'
import { orderStatuses, testFor } from '../adminOverviewModel.js'

export default function AdminOrders({ orders, query, status, page, onQuery, onStatus, onPage, onDetails, copy, local, number, money, date, sectionRef }) {
  const pageSize = 8
  const pages = Math.max(1, Math.ceil(orders.length / pageSize))
  const visible = orders.slice((page - 1) * pageSize, page * pageSize)
  return <section ref={sectionRef} className="admin-overview-panel admin-orders-section" tabIndex={-1} aria-labelledby="admin-orders-heading">
    <div className="admin-overview-panel-heading"><div><h3 id="admin-orders-heading">{copy.recent}</h3><p>{copy.recentNote}</p></div><span className="admin-overview-muted">{number(orders.length)} {copy.records}</span></div>
    <div className="admin-order-filters">
      <label className="admin-order-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label={copy.search} placeholder={copy.searchPlaceholder} value={query} onChange={event => onQuery(event.target.value)} /></label>
      <select aria-label={copy.statusFilter} value={status} onChange={event => onStatus(event.target.value)}><option value="all">{copy.all}</option>{orderStatuses.map(value => <option key={value} value={value}>{copy.statuses[value]}</option>)}</select>
    </div>
    <div className="admin-overview-table-scroll" role="region" aria-label={copy.recent} tabIndex={0}>
      <table><caption className="admin-overview-sr-only">{copy.demo} · {copy.recent}</caption><thead><tr>{[copy.order, copy.patient, copy.test, copy.date, copy.amount, copy.status, copy.details].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{visible.map(order => <tr key={order.id}>
          <th scope="row"><bdi>{order.id}</bdi></th>
          <td><span className="admin-person-cell"><span className="admin-person-avatar" aria-hidden="true">{local(order.patient).charAt(0)}</span><span>{local(order.patient)}</span></span></td>
          <td>{local(testFor(order.testId).name)}</td><td><time dateTime={order.date}>{date(order.date)}</time></td>
          <td className="admin-amount">{money(order.amount)}</td><td><span className={`admin-overview-status admin-order-${order.status}`}>{copy.statuses[order.status]}</span></td>
          <td><button type="button" className="admin-overview-text-button" aria-label={`${copy.view} ${order.id}`} onClick={event => onDetails(order, event.currentTarget)}>{copy.view}<ArrowUpRight size={14} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table>
      {!orders.length && <p className="admin-overview-empty" role="status">{copy.noOrders}</p>}
    </div>
    <div className="admin-order-pagination"><span>{copy.page} {number(page)} {copy.of} {number(pages)}</span><div><button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>{copy.previous}</button><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{copy.next}</button></div></div>
  </section>
}
