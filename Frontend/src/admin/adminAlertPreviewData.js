import { demoSampleEvents, offsetDate } from './adminDemoData.js'

// Dashboard-only preview flags, not inferred from payment or processing status.
// No persistence, network calls, or live alert feed. Replace with verified alerts
// when an API and explicit attention/review semantics are available.
const previewAttentionFlags = [
  { orderId: 'DEMO-O-1401', date: offsetDate(0), reason: 'collection-follow-up' },
  { orderId: 'DEMO-O-1302', date: offsetDate(-1), reason: 'details-verification' },
]

export function laboratoryPreviewAlerts(orders, days) {
  const start = offsetDate(1 - days)
  const end = offsetDate(0)
  const inPeriod = event => event.date >= start && event.date <= end
  return {
    rejected: demoSampleEvents.filter(event => event.status === 'rejected' && inPeriod(event)).length,
    review: orders.filter(order => order.status === 'review').length,
    attention: previewAttentionFlags.filter(inPeriod).length,
  }
}
