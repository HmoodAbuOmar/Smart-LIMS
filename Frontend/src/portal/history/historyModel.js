export function numericResult(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
export function resultFlag(row) {
  if (row.flag === 'critical') return row.criticalVerified === true ? 'critical' : 'unclassified'
  if (['normal', 'high', 'low'].includes(row.flag)) return row.flag
  const value = numericResult(row.value), range = row.reference
  if (value === null || !range || range.unit !== row.unit || !Number.isFinite(range.low) || !Number.isFinite(range.high) || range.low > range.high) return 'unclassified'
  return value < range.low ? 'low' : value > range.high ? 'high' : 'normal'
}
export function medicalVisits(state, now = new Date()) {
  const patientId = state.profile.fileNumber
  const owned = record => typeof patientId === 'string' && patientId.length > 0 && record.patientId === patientId
  return state.appointments.flatMap(appointment => {
    if (appointment.status !== 'completed' || !owned(appointment)) return []
    const timestamp = `${appointment.date}T${appointment.time || '00:00'}:00`
    if (!Number.isFinite(new Date(timestamp).getTime()) || new Date(timestamp) > now) return []
    const order = state.orders.find(order => order.id === appointment.orderId && order.status === 'completed' && owned(order))
    if (!order) return []
    const reports = state.results.filter(report => report.orderId === order.id && report.appointmentId === appointment.id && order.tests.includes(report.testId) && report.status === 'published' && report.verified === true && Array.isArray(report.values) && report.values.length > 0 && owned(report) && Number.isFinite(new Date(report.date).getTime()) && new Date(report.date) <= now)
    if (!reports.length) return []
    const flags = reports.flatMap(report => report.values.map(resultFlag))
    const status = flags.length ? ['critical', 'high', 'low', 'unclassified'].find(flag => flags.includes(flag)) || 'normal' : 'unclassified'
    return [{ id: appointment.visitId || `visit-${appointment.id}`, timestamp, appointment, order, reports, status, flags }]
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}
export function visitForResult(state, resultId) { return medicalVisits(state).find(visit => visit.reports.some(report => report.id === resultId)) }
export function visitForOrder(state, orderId) { return medicalVisits(state).find(visit => visit.order.id === orderId) }
export function visitForAppointment(state, appointmentId) { return medicalVisits(state).find(visit => visit.appointment.id === appointmentId) }
export function measurementSeries(visits, now = new Date()) {
  const groups = new Map()
  for (const visit of visits) for (const report of visit.reports) for (const [rowIndex, row] of report.values.entries()) {
    const value = numericResult(row.value)
    if (!row.biomarkerId || !row.unit || !row.methodId || !row.specimen || !report.measuredAt || value === null || !Number.isFinite(new Date(report.measuredAt).getTime()) || new Date(report.measuredAt) > now) continue
    const key = JSON.stringify([row.biomarkerId, row.unit, row.methodId, row.specimen])
    if (!groups.has(key)) groups.set(key, { key, biomarkerId: row.biomarkerId, name: row.name, unit: row.unit, method: row.methodName || row.methodId, points: [] })
    groups.get(key).points.push({ ...row, value, displayValue: String(row.value), id: row.measurementId || `${report.id}:${rowIndex}:${row.biomarkerId}`, date: report.measuredAt, visitId: visit.id, reference: row.reference, reportId: report.id })
  }
  return [...groups.values()].map(series => ({ ...series, points: series.points.filter(point => Number.isFinite(new Date(point.date).getTime())).sort((a, b) => new Date(a.date) - new Date(b.date)) })).filter(series => series.points.length)
}
export function measurementsInRange(points, period, now = new Date()) {
  if (period === 'allTime') return points.filter(point => Number.isFinite(new Date(point.date).getTime()) && new Date(point.date) <= now)
  const months = { months3: 3, months6: 6, year1: 12 }[period]
  if (!months) return []
  const start = new Date(now); start.setMonth(start.getMonth() - months)
  return points.filter(point => new Date(point.date) >= start && new Date(point.date) <= now)
}
export function trendStatistics(points) {
  const latest = points.at(-1), previous = points.at(-2)
  const change = latest && previous ? latest.value - previous.value : null
  const percent = previous?.value > 0 && latest?.value >= 0 ? change / previous.value * 100 : null
  return { latest, previous, change, percent }
}
