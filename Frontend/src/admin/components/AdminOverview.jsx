import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { dashboardCopy } from '../dashboardCopy.js'
import AdminKpiCards from './AdminKpiCards.jsx'
import AdminCharts from './AdminCharts.jsx'
import AdminOrders from './AdminOrders.jsx'
import AdminLaboratoryAlerts from './AdminLaboratoryAlerts.jsx'
import '../adminOverview.css'

export default function AdminOverview({ language, service, preview }) {
  const copy = dashboardCopy[language]
  const [days, setDays] = useState(7)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [live, setLive] = useState(null)
  const [orderPage, setOrderPage] = useState(null)
  const [ordersAttempt, retryOrders] = useState(0)
  const [failure, setFailure] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const ordersSection = useRef(null)
  const dialog = useRef(null)
  const detailOpener = useRef(null)
  const local = values => Array.isArray(values) ? values[language === 'ar' ? 1 : 0] : values
  const unavailable = language === 'ar' ? 'غير متاح' : 'Unavailable'
  const number = value => value == null ? unavailable : new Intl.NumberFormat(language).format(value)
  const money = value => value == null ? unavailable : new Intl.NumberFormat(language, { style: 'currency', currency: 'ILS', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(value)
  const date = (value, compact = false) => new Intl.DateTimeFormat(language, {
    day: 'numeric', month: 'short', ...(compact ? {} : { year: 'numeric' }), timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
  useEffect(() => {
    if (!service) return
    const controller = new AbortController()
    service.load(days, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setLive(result) }, () => { if (!controller.signal.aborted) setFailure(true) })
    return () => controller.abort()
  }, [service, days, attempt])
  const dashboard = live
  const fromDate = dashboard?.charts.period.fromDate, toDate = dashboard?.charts.period.toDate
  const orderKey = JSON.stringify([page, query, status, fromDate, toDate, ordersAttempt])
  useEffect(() => {
    if (!service || !fromDate || !toDate) return
    const controller = new AbortController()
    service.orders({ page: page - 1, size: 8, fromDate, toDate, search: query.trim() || undefined,
      status: { received: 'PENDING', processing: 'IN_PROGRESS', completed: 'COMPLETED', cancelled: 'CANCELLED' }[status] }, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setOrderPage({ key: orderKey, result }) },
        () => { if (!controller.signal.aborted) setOrderPage({ key: orderKey, error: true }) })
    return () => controller.abort()
  }, [service, page, query, status, fromDate, toDate, orderKey])
  const currentOrders = orderPage?.key === orderKey ? orderPage : null
  const orders = service ? currentOrders?.result?.content || [] : preview.periodOrders(days)
  const summary = service ? dashboard && {
    patients: dashboard.summary.uniquePatients, total: dashboard.summary.orders, appointments: dashboard.summary.scheduledAppointments,
    completedTests: dashboard.summary.completedTests, pendingResults: dashboard.summary.pendingResults, revenue: null,
  } : preview.summarizeOrders(orders)
  const liveStatuses = { NEW: 'received', IN_PROGRESS: 'processing', COMPLETED: 'completed', CANCELLED: 'cancelled' }
  const statuses = { ...copy.statuses, cancelled: language === 'ar' ? 'ملغى' : 'Cancelled' }
  const filtered = service ? orders.map(entry => ({
    ...entry, orderNumber: entry.number, patient: entry.patient.nameEn, testNames: entry.tests.map(item => item.nameEn).join(', '),
    amount: entry.totalCents / 100, status: liveStatuses[entry.status],
  })) : preview.filterOrders(orders, query, status, local).map(entry => ({ ...entry, orderNumber: preview.displayOrderId(entry.id), testNames: local(preview.testFor(entry.testId).name) }))
  const counts = dashboard && {
    rejected: dashboard.alerts.rejectedSamples.count, review: dashboard.alerts.resultsAwaitingReview.count,
    attention: dashboard.alerts.ordersRequiringAttention.count,
  }

  useEffect(() => {
    if (selectedOrder) dialog.current?.showModal()
    else if (dialog.current?.open) {
      dialog.current.close()
      if (detailOpener.current?.isConnected) detailOpener.current.focus()
    }
  }, [selectedOrder])

  if (service && !dashboard) return <div className="admin-overview"><h2>{copy.welcome}</h2>
    <p role={failure ? 'alert' : 'status'}>{failure ? unavailable : language === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>
    {failure && <button type="button" onClick={() => { setFailure(false); setAttempt(value => value + 1) }}>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>}
  </div>
  const referenceDate = dashboard ? dashboard.charts.period.toDate : preview.demoDate
  const orderName = entry => entry.orderNumber || unavailable
  const testName = entry => entry.testNames ?? unavailable
  return <div className="admin-overview">
    <div className="admin-overview-heading"><div><h2>{copy.welcome}</h2><p>{copy.subtitle}</p></div>
      <div className="admin-welcome-meta"><span className="admin-reference-date"><CalendarDays size={15} aria-hidden="true" /><time dateTime={referenceDate}>{date(referenceDate)}</time></span></div>
    </div>
    <AdminKpiCards summary={summary} copy={copy} number={number} money={money} />
    <AdminCharts daily={dashboard ? dashboard.charts.dailyOrders : preview.dailyOrders(orders, days)}
      summary={dashboard ? { total: dashboard.charts.totalOrders, totalTests: dashboard.charts.totalTests, testDistribution: dashboard.charts.testDistribution.map(item => ({
        id: `${item.labTestId}-${item.testCode}-${item.testName}`, name: item.testName, count: item.count,
      })) } : summary} copy={copy} number={number} date={date} local={local} rtl={language === 'ar'} days={days}
      onPeriod={value => { if (days !== value) { if (service) { setLive(null); setFailure(false) } setDays(value); setPage(1) } }} />
    <div className="admin-overview-tables">
      <AdminOrders orders={filtered} pagination={service ? currentOrders?.result || { totalElements: 0, totalPages: 0 } : undefined}
        loadMessage={service && !currentOrders ? (language === 'ar' ? 'جارٍ التحميل…' : 'Loading…') : currentOrders?.error ? unavailable : undefined}
        retry={currentOrders?.error ? () => retryOrders(value => value + 1) : undefined} query={query} status={status} page={page} copy={service ? { ...copy, statuses } : copy} choices={service ? Object.values(liveStatuses) : undefined} local={local} number={number} money={money} date={date} sectionRef={ordersSection}
        onQuery={value => { setQuery(value); setPage(1) }} onStatus={value => { setStatus(value); setPage(1) }} onPage={setPage}
        onDetails={(order, opener) => { detailOpener.current = opener; setSelectedOrder(order) }} />
      <AdminLaboratoryAlerts counts={service ? counts : preview.laboratoryPreviewAlerts(orders, days)} copy={copy} number={number} />
    </div>
    <dialog className="admin-order-dialog" ref={dialog} aria-labelledby="admin-order-dialog-title" aria-describedby="admin-order-dialog-notice" onCancel={event => { event.preventDefault(); setSelectedOrder(null) }}>
      <h3 id="admin-order-dialog-title">{copy.detailTitle}</h3><p id="admin-order-dialog-notice">{service ? copy.recent : copy.detailNotice}</p>
      {selectedOrder && <dl>{[
        [copy.order, orderName(selectedOrder)], [copy.patient, local(selectedOrder.patient)], [copy.test, testName(selectedOrder)],
        [copy.date, date(selectedOrder.date)], [copy.amount, money(selectedOrder.amount)], [copy.status, statuses[selectedOrder.status]], [copy.payment, statuses[selectedOrder.payment] || unavailable],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      <button type="button" className="admin-overview-primary-button" onClick={() => setSelectedOrder(null)}>{copy.close}</button>
    </dialog>
  </div>
}
