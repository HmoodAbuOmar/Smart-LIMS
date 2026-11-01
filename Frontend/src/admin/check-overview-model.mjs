import assert from 'node:assert/strict'
import { demoAppointments, demoDate, demoOrders, offsetDate } from './adminDemoData.js'
import { dailyOrders, filterOrders, ordersCsv, periodOrders, summarizeOrders, testFor } from './adminOverviewModel.js'
import { dashboardCopy } from './dashboardCopy.js'

assert.equal(new Set(demoOrders.map(order => order.id)).size, demoOrders.length)
assert.ok(demoOrders.every(order => order.id.startsWith('DEMO-') && testFor(order.testId)))
assert.ok(demoAppointments.every(appointment => appointment.id.startsWith('DEMO-') && appointment.date >= demoDate))
assert.equal(offsetDate(0), demoDate)
assert.equal(offsetDate(-1), '2026-10-31')
for (const days of [7, 14]) {
  const orders = periodOrders(days)
  const summary = summarizeOrders(orders)
  const daily = dailyOrders(orders, days)
  assert.equal(daily.length, days)
  assert.equal(summary.total, daily.reduce((total, day) => total + day.count, 0))
  assert.equal(summary.total, summary.distribution.reduce((total, entry) => total + entry.count, 0))
  assert.equal(summary.total, summary.testDistribution.reduce((total, entry) => total + entry.count, 0))
  assert.equal(summary.patients, new Set(orders.map(order => order.patient[0])).size)
  assert.equal(summary.completedTests + summary.pendingResults, summary.total)
  assert.equal(summary.completedTests, orders.filter(order => order.status === 'completed').length)
  assert.equal(summary.revenue, orders.reduce((total, order) => total + (order.payment === 'paid' ? order.amount : 0), 0))
  assert.equal(summary.review, orders.filter(order => order.status === 'review').length)
  assert.equal(summary.appointments, demoAppointments.length)
  for (const language of ['en', 'ar']) {
    const local = value => value[language === 'ar' ? 1 : 0]
    const copy = dashboardCopy[language]
    assert.equal(filterOrders(orders, 'DEMO-O-1401', 'all', local).length, 1)
    assert.equal(filterOrders(orders, 'not-a-demo-order', 'all', local).length, 0)
    assert.ok(filterOrders(orders, local(orders[0].patient), 'all', local).length > 0)
    assert.ok(filterOrders(orders, '', 'review', local).every(order => order.status === 'review'))
    assert.ok(orders.every(order => copy.statuses[order.status] && copy.statuses[order.payment]))
    const csv = ordersCsv(orders, copy, local, value => value)
    assert.equal(csv.split('\r\n').length, orders.length + 1)
    assert.ok(csv.includes('ILS') && csv.includes('DEMO-O-'))
    const escaped = ordersCsv([{ ...orders[0], patient: ['=SUM(1)', '=SUM(1)'] }], copy, local, value => value)
    assert.ok(escaped.includes("'=SUM(1)"))
  }
}
const empty = summarizeOrders([])
assert.equal(empty.total + empty.revenue + empty.review, 0)
console.log('PASS: deterministic demo data, KPI/chart totals, periods, paid revenue, bilingual filtering, CSV rows, and formula escaping.')
