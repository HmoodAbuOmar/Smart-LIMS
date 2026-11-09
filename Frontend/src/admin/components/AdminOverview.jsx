import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { demoDate } from '../adminDemoData.js'
import { dashboardCopy } from '../dashboardCopy.js'
import { dailyOrders, displayOrderId, filterOrders, periodOrders, summarizeOrders, testFor } from '../adminOverviewModel.js'
import AdminKpiCards from './AdminKpiCards.jsx'
import AdminCharts from './AdminCharts.jsx'
import AdminOrders from './AdminOrders.jsx'
import AdminLaboratoryAlerts from './AdminLaboratoryAlerts.jsx'
import { laboratoryPreviewAlerts } from '../adminAlertPreviewData.js'
import '../adminOverview.css'

export default function AdminOverview({ language }) {
  const copy = dashboardCopy[language]
  const [days, setDays] = useState(7)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const ordersSection = useRef(null)
  const dialog = useRef(null)
  const detailOpener = useRef(null)
  const local = values => values[language === 'ar' ? 1 : 0]
  const number = value => new Intl.NumberFormat(language).format(value)
  const money = value => new Intl.NumberFormat(language, { style: 'currency', currency: 'ILS', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(value)
  const date = (value, compact = false) => new Intl.DateTimeFormat(language, {
    day: 'numeric', month: 'short', ...(compact ? {} : { year: 'numeric' }), timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
  const orders = periodOrders(days)
  const summary = summarizeOrders(orders)
  const filtered = filterOrders(orders, query, status, local)

  useEffect(() => {
    if (selectedOrder) dialog.current?.showModal()
    else if (dialog.current?.open) {
      dialog.current.close()
      if (detailOpener.current?.isConnected) detailOpener.current.focus()
    }
  }, [selectedOrder])

  return <div className="admin-overview">
    <div className="admin-overview-heading"><div><h2>{copy.welcome}</h2><p>{copy.subtitle}</p></div>
      <div className="admin-welcome-meta"><span className="admin-reference-date"><CalendarDays size={15} aria-hidden="true" /><time dateTime={demoDate}>{date(demoDate)}</time></span></div>
    </div>
    <AdminKpiCards summary={summary} copy={copy} number={number} money={money} />
    <AdminCharts daily={dailyOrders(orders, days)} summary={summary} copy={copy} number={number} date={date} local={local} rtl={language === 'ar'} days={days}
      onPeriod={value => { setDays(value); setPage(1) }} />
    <div className="admin-overview-tables">
      <AdminOrders orders={filtered} query={query} status={status} page={page} copy={copy} local={local} number={number} money={money} date={date} sectionRef={ordersSection}
        onQuery={value => { setQuery(value); setPage(1) }} onStatus={value => { setStatus(value); setPage(1) }} onPage={setPage}
        onDetails={(order, opener) => { detailOpener.current = opener; setSelectedOrder(order) }} />
      <AdminLaboratoryAlerts counts={laboratoryPreviewAlerts(orders, days)} copy={copy} number={number} />
    </div>
    <dialog className="admin-order-dialog" ref={dialog} aria-labelledby="admin-order-dialog-title" aria-describedby="admin-order-dialog-notice" onCancel={event => { event.preventDefault(); setSelectedOrder(null) }}>
      <h3 id="admin-order-dialog-title">{copy.detailTitle}</h3><p id="admin-order-dialog-notice">{copy.detailNotice}</p>
      {selectedOrder && <dl>{[
        [copy.order, displayOrderId(selectedOrder.id)], [copy.patient, local(selectedOrder.patient)], [copy.test, local(testFor(selectedOrder.testId).name)],
        [copy.date, date(selectedOrder.date)], [copy.amount, money(selectedOrder.amount)], [copy.status, copy.statuses[selectedOrder.status]], [copy.payment, copy.statuses[selectedOrder.payment]],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      <button type="button" className="admin-overview-primary-button" onClick={() => setSelectedOrder(null)}>{copy.close}</button>
    </dialog>
  </div>
}
