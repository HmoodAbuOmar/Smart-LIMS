import { ORDER_STATUSES, inPeriod, periodRecords, summarize, periodErrors } from '../operationsPayments/operationsPaymentsModel.js'
export { defaultPeriod, periodErrors, REPORT_TIME_ZONE } from '../operationsPayments/operationsPaymentsModel.js'
export { ORDER_STATUSES }
export function buildReport(data, period) {
  if (!period.from || !period.to || Object.keys(periodErrors(period)).length) throw new Error('Invalid reporting period')
  const records = periodRecords(data, period)
  const ordersByStatus = ORDER_STATUSES.map(status => ({ status, count: new Set(records.orders.filter(order => order.status === status).map(order => order.id)).size }))
  const testsByStatus = ORDER_STATUSES.map(status => ({ status, count: records.orders.filter(order => order.status === status).reduce((count, order) => count + order.tests.length, 0) }))
  const appointments = data.appointments?.filter(appointment => appointment.scheduledDate && inPeriod(appointment.scheduledDate, period))
  const rejected = data.samples?.filter(sample => sample.status === 'rejected' && inPeriod(sample.date, period))
  const financial = summarize(records)
  return {
    ordersByStatus, testsByStatus,
    attendance: appointments ? {
      scheduled: appointments.filter(appointment => ['BOOKED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)).length,
      attended: appointments.filter(appointment => ['CHECKED_IN', 'COMPLETED'].includes(appointment.status)).length,
      noShow: appointments.filter(appointment => appointment.status === 'NO_SHOW').length,
    } : null,
    rejected: rejected ? new Set(rejected.map(sample => sample.id)).size : null,
    financial,
    empty: !records.orders.length && !records.transactions.length && !appointments?.length && !rejected?.length,
  }
}
