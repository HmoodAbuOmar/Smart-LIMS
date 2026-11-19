import { authenticatedRequest } from '../auth/cookieSession.js'

async function unavailable() { const error = new Error('Portal transport is not configured'); error.code = 'SERVICE_UNAVAILABLE'; throw error }
const request = authenticatedRequest
const id = encodeURIComponent
const write = (path, body, method = 'POST', requestId) => request(path, { method, body, requestId })
const get = (path, params, options) => request(path + '?' + new URLSearchParams(params), options)

async function list(path, params, options) {
  const rows = []
  for (let page = 0; ; page++) {
    const result = await get(path, { ...params, page, size: 50 }, options)
    if (Array.isArray(result)) return result
    rows.push(...result.content)
    if (result.last || page + 1 >= result.totalPages || !result.content.length) return rows
  }
}

const day = value => value?.slice(0, 10)
const status = value => value.toLowerCase().replace('in_progress', 'inProgress')
const category = value => ({ BLOOD_TESTS: 'blood', VITAMINS_MINERALS: 'vitamins' }[value] || value?.toLowerCase() || 'other')
const flag = value => ({ NOT_EVALUATED: 'unclassified', ABNORMAL: 'abnormal' }[value] || value?.toLowerCase() || 'unclassified')
const profile = row => ({
  id: row.id, fileNumber: row.patientNumber, name: row.fullName, email: row.email,
  phone: row.phoneNumber, address: row.address || '', dateOfBirth: row.dateOfBirth, gender: row.gender.toLowerCase(),
})
const test = row => ({
  id: row.id, name: row.name, code: row.code, description: row.description, price: Number(row.price),
  category: category(row.categories?.[0]), categories: row.categories?.map(category) || [],
  sample: row.sampleType, prep: row.preparationInstructions,
})
const order = (row, patient) => ({
  id: row.id, number: row.orderNumber, patientId: row.patientId && row.patientId !== patient.id ? null : patient.fileNumber, date: day(row.createdAt),
  status: status(row.status), total: Number(row.totalAmount), testCount: row.testCount,
  items: row.items, tests: row.items?.map(item => item.labTestId) || [], canCancel: row.canCancel,
})
const appointment = (row, patient) => ({
  ...row, patientId: patient.fileNumber, date: row.appointmentDate, time: row.appointmentTime.slice(0, 5),
  type: row.typeName, status: status(row.status), serverConfirmed: true, source: 'server',
})
const result = row => ({
  id: row.currentResultId || row.orderItemId, orderId: row.orderId, orderNumber: row.orderNumber,
  orderItemId: row.orderItemId, testName: row.testName, category: category(row.categories?.[0]),
  date: row.reportDate || day(row.publishedAt), status: row.canViewResult ? 'published' : 'pending',
  canDownloadReport: row.canDownloadReport,
})
const notification = row => ({
  ...row, category: row.category.toLowerCase(), date: row.createdAt,
  target: row.resultId ? 'results/' + row.resultId : row.appointmentId ? 'appointments/' + row.appointmentId
    : row.orderId ? 'orders/' + row.orderId : null,
})
const resultValues = row => row.values.map(value => ({
  name: value.name, unit: value.unit, flag: flag(value.flag),
  value: value.textValue ?? (value.numericValue == null ? null : (value.numericComparator || '') + value.numericValue),
  range: value.referenceText ?? [value.referenceMin, value.referenceMax].filter(bound => bound != null).join(' – '),
}))
const visit = row => {
  const flags = row.resultFlags.map(flag)
  return {
    id: row.id, number: row.visitNumber, timestamp: row.arrivedAt || row.completedAt, flags,
    status: ['abnormal', 'high', 'low', 'unclassified', 'normal'].find(value => flags.includes(value)) || 'unclassified',
    appointment: { id: row.appointmentId, date: row.visitDate },
    order: { id: row.orderId, number: row.orderNumber, tests: row.tests.map(item => item.labTestId) },
    testNames: Object.fromEntries(row.tests.map(item => [item.labTestId, item.testName])),
    reports: row.tests.filter(item => item.resultId).map(item => ({
      id: item.resultId, testId: item.labTestId, testName: item.testName, values: [], status: 'published',
    })),
  }
}
const trendPoint = row => ({
  id: row.valueId, reportId: row.resultId, visitId: row.visits[0]?.id,
  date: row.measuredAt, value: Number(row.chartValue), displayValue: (row.numericComparator || '') + row.numericValue,
  flag: flag(row.flag), range: row.referenceText ?? [row.referenceMin, row.referenceMax].filter(bound => bound != null).join(' – '),
})
function trendSeries(series, rows) {
  return {
    key: series.seriesId, biomarkerId: series.parameterId, name: series.name, unit: series.unit, method: series.method,
    points: rows.filter(row => row.chartValue != null).map(trendPoint).sort((a, b) => a.date.localeCompare(b.date)),
  }
}
export const portalApi = Object.freeze({
  async loadWorkspace(options) {
    const [person, dashboard, tests, orders, upcoming, past, results, notifications, archive] = await Promise.all([
      request('/api/patients/me/profile', options), request('/api/patients/me/dashboard', options),
      list('/api/lab-tests', {}, options), list('/api/orders/me', {}, options),
      list('/api/appointments/me', { tab: 'UPCOMING' }, options), list('/api/appointments/me', { tab: 'PAST' }, options),
      list('/api/results/me', {}, options), list('/api/notifications/me', {}, options),
      list('/api/visits/me/archive', {}, options),
    ])
    const patient = profile(person)
    return {
      profile: patient, dashboard, tests: tests.filter(row => row.active && row.currency === 'ILS').map(test),
      suggestedTests: dashboard.catalogSuggestions.filter(row => row.active && row.currency === 'ILS').map(test),
      orders: orders.map(row => order(row, patient)),
      appointments: [...upcoming, ...past].map(row => appointment(row, patient)),
      results: results.map(result), notifications: notifications.map(notification),
      visits: archive.map(visit),
      trendPreview: dashboard.healthTrendPreview && trendSeries(dashboard.healthTrendPreview.series, dashboard.healthTrendPreview.chartData),
    }
  },
  async saveProfile({ profile: values }) {
    const saved = await write('/api/patients/me/profile', {
      fullName: values.name, dateOfBirth: values.dateOfBirth, gender: values.gender.toUpperCase(),
      phoneNumber: values.phone, address: values.address || null,
    }, 'PUT')
    return { confirmed: true, profile: profile(saved) }
  },
  async createOrder({ tests, requestId }, patient) {
    return { confirmed: true, order: order(await write('/api/orders/me', { testIds: tests }, 'POST', requestId), patient) }
  },
  async orderDetail(orderId, patient, options) {
    const record = order(await request('/api/orders/me/' + id(orderId), options), patient)
    if (record.patientId !== patient.fileNumber) throw new Error('Order does not belong to the current patient')
    return record
  },
  async cancelOrder({ id: orderId }, patient) {
    return { confirmed: true, order: order(await write('/api/orders/' + id(orderId) + '/cancel', {}), patient) }
  },
  appointmentTypes: options => list('/api/appointment-types', {}, options),
  slots({ orderId, typeId, existing, from, to }, options) {
    return existing ? list('/api/appointments/' + id(existing) + '/alternatives', { from, to }, options)
      : list('/api/appointment-slots', { orderId, typeId, from, to }, options)
  },
  async bookAppointment({ appointment: draft, requestId }, patient) {
    const saved = await write('/api/appointments', { orderId: draft.orderId, typeId: draft.typeId, slotId: draft.slotId }, 'POST', requestId)
    return { confirmed: true, appointment: appointment(saved, patient) }
  },
  async rescheduleAppointment({ existing, appointment: draft }, patient) {
    const saved = await write('/api/appointments/' + id(existing) + '/reschedule', { slotId: draft.slotId, expectedVersion: draft.version })
    return { confirmed: true, appointment: appointment(saved, patient) }
  },
  async cancelAppointment({ id: appointmentId }, patient) {
    return { confirmed: true, appointment: appointment(await write('/api/appointments/' + id(appointmentId) + '/cancel', {}), patient) }
  },
  async readNotifications({ id: notificationId }) {
    await write('/api/notifications/me/' + (notificationId === 'all' ? 'read-all' : id(notificationId) + '/read'), {})
    return { confirmed: true }
  },
  async activity() {
    const [results, notifications] = await Promise.all([list('/api/results/me'), list('/api/notifications/me')])
    return { results: results.map(result), notifications: notifications.map(notification) }
  },
  async resultDetail(resultId, options) {
    const row = await request('/api/results/me/' + id(resultId), options)
    return {
      id: row.id, testName: row.testName, orderId: row.orderId, orderNumber: row.orderNumber,
      status: status(row.status), date: day(row.publishedAt), sampleDate: day(row.specimens[0]?.collectedAt),
      canDownloadReport: true,
      values: resultValues(row),
    }
  },
  async visitDetail(visitId, options) {
    const detail = await request('/api/visits/me/archive/' + id(visitId), options)
    const entry = visit(detail.visit)
    return { ...entry, reports: entry.reports.map(report => {
      const result = detail.results.find(row => row.id === report.id)
      return result ? { ...report, values: resultValues(result) } : report
    }) }
  },
  biomarkerSeries: options => list('/api/results/me/trends/biomarkers', {}, options),
  async healthTrend(seriesId, period, options) {
    const response = await get('/api/results/me/trends', { seriesId, period }, options)
    return trendSeries(response.series, response.chartData)
  },
  downloadReport: ({ resultId }) => request('/api/results/me/' + id(resultId) + '/report', { pdf: true }),
  logout: unavailable,
})
// Hosted session creation must never itself count as verified payment success.
export const bookingApi = Object.freeze({ createHostedPayment: unavailable, verifyPaymentAndBooking: unavailable, confirmPayAtLaboratory: unavailable })
