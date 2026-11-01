import { demoAppointments, demoOrders, demoTests, offsetDate } from './adminDemoData.js'

export const orderStatuses = ['received', 'processing', 'review', 'completed']
export const testFor = id => demoTests.find(test => test.id === id)

export function periodOrders(days) {
  return demoOrders.filter(order => order.date >= offsetDate(1 - days))
}

export function summarizeOrders(orders) {
  return {
    total: orders.length,
    patients: new Set(orders.map(order => order.patient[0])).size,
    completedTests: orders.filter(order => order.status === 'completed').length,
    pendingResults: orders.filter(order => order.status !== 'completed').length,
    revenue: orders.filter(order => order.payment === 'paid').reduce((sum, order) => sum + order.amount, 0),
    review: orders.filter(order => order.status === 'review').length,
    appointments: demoAppointments.length,
    distribution: orderStatuses.map(status => ({ status, count: orders.filter(order => order.status === status).length })),
    testDistribution: demoTests.map(test => ({ ...test, count: orders.filter(order => order.testId === test.id).length })),
  }
}

export function dailyOrders(orders, days) {
  return Array.from({ length: days }, (_, index) => {
    const date = offsetDate(index + 1 - days)
    return { date, count: orders.filter(order => order.date === date).length }
  })
}

export function filterOrders(orders, query, status, local) {
  const needle = query.trim().toLocaleLowerCase()
  return orders.filter(order => (status === 'all' || order.status === status) &&
    [order.id, ...order.patient, ...testFor(order.testId).name, local(order.patient)].join(' ').toLocaleLowerCase().includes(needle))
}

// Export only explicit demo fields. Prefix formula-like cells defensively.
export function ordersCsv(orders, copy, local, date) {
  const rows = [[copy.order, copy.patient, copy.test, copy.date, copy.status, copy.payment, `${copy.amount} (ILS)`],
    ...orders.map(order => [order.id, local(order.patient), local(testFor(order.testId).name), date(order.date), copy.statuses[order.status], copy.statuses[order.payment], String(order.amount)])]
  return '\ufeff' + rows.map(row => row.map(value => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return `"${safe.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}
