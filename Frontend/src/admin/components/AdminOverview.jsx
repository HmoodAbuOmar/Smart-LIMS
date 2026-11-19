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

export default function AdminOverview({ language, service }) {
  const copy = dashboardCopy[language]
  const [days, setDays] = useState(7)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [live, setLive] = useState(null)
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
    let current = true
    service.load(days).then(result => { if (current) setLive(result) }, () => { if (current) setFailure(true) })
    return () => { current = false }
  }, [service, days, attempt])
  const dashboard = live?.dashboard
  const orders = service ? (live?.orders || []).filter(entry => entry.date >= dashboard.charts.period.fromDate && entry.date <= dashboard.charts.period.toDate) : periodOrders(days)
  const summary = service ? dashboard && {
    patients: dashboard.summary.uniquePatients, total: dashboard.summary.orders, appointments: dashboard.summary.scheduledAppointments,
    completedTests: dashboard.summary.completedTests, pendingResults: dashboard.summary.pendingResults, revenue: null,
  } : summarizeOrders(orders)
  const liveStatuses = { NEW: 'received', IN_PROGRESS: 'processing', COMPLETED: 'completed', CANCELLED: 'cancelled' }
  const statuses = { ...copy.statuses, cancelled: language === 'ar' ? 'ملغى' : 'Cancelled' }
  const filtered = service ? orders.map(entry => ({
    ...entry, orderNumber: entry.number, patient: entry.patient.nameEn, testNames: entry.tests.map(item => item.nameEn).join(', '),
    amount: entry.totalCents / 100, status: liveStatuses[entry.status],
  })).filter(entry => (status === 'all' || entry.status === status) &&
    [entry.orderNumber, entry.patient, entry.testNames].some(text => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))) : filterOrders(orders, query, status, local)
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
  const referenceDate = dashboard ? dashboard.charts.period.toDate : demoDate
  const orderName = entry => entry.orderNumber || displayOrderId(entry.id)
  const testName = entry => entry.testNames ?? local(testFor(entry.testId).name)
  return <div className="admin-overview">
    <div className="admin-overview-heading"><div><h2>{copy.welcome}</h2><p>{copy.subtitle}</p></div>
      <div className="admin-welcome-meta"><span className="admin-reference-date"><CalendarDays size={15} aria-hidden="true" /><time dateTime={referenceDate}>{date(referenceDate)}</time></span></div>
    </div>
    <AdminKpiCards summary={summary} copy={copy} number={number} money={money} />
    <AdminCharts daily={dashboard ? dashboard.charts.dailyOrders : dailyOrders(orders, days)}
      summary={dashboard ? { total: dashboard.charts.totalOrders, totalTests: dashboard.charts.totalTests, testDistribution: dashboard.charts.testDistribution.map(item => ({
        id: `${item.labTestId}-${item.testCode}-${item.testName}`, name: item.testName, count: item.count,
      })) } : summary} copy={copy} number={number} date={date} local={local} rtl={language === 'ar'} days={days}
      onPeriod={value => { if (days !== value) { if (service) { setLive(null); setFailure(false) } setDays(value); setPage(1) } }} />
    <div className="admin-overview-tables">
      <AdminOrders orders={filtered} query={query} status={status} page={page} copy={service ? { ...copy, statuses } : copy} choices={service ? Object.values(liveStatuses) : undefined} local={local} number={number} money={money} date={date} sectionRef={ordersSection}
        onQuery={value => { setQuery(value); setPage(1) }} onStatus={value => { setStatus(value); setPage(1) }} onPage={setPage}
        onDetails={(order, opener) => { detailOpener.current = opener; setSelectedOrder(order) }} />
      <AdminLaboratoryAlerts counts={service ? counts : laboratoryPreviewAlerts(orders, days)} copy={copy} number={number} />
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
