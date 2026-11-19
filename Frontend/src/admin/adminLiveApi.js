import { authenticatedRequest } from '../auth/cookieSession.js'
import { schedulingDate, schedulingInstant, SCHEDULING_TIME_ZONE } from './bookingSlots/bookingSlotsModel.js'
import { rangeFields } from './catalog/adminCatalogModel.js'
import { reportDate } from './operationsPayments/operationsPaymentsModel.js'

function get(path, params = {}) {
  const query = new URLSearchParams(params).toString()
  return authenticatedRequest(path + (query ? `?${query}` : ''))
}
const write = (path, method, body) => authenticatedRequest(path, { method, body })

async function list(path, params) {
  const items = []
  for (let page = 0; ; page++) {
    const response = await get(path, { ...params, page, size: 100 })
    if (Array.isArray(response)) return response
    items.push(...response.content)
    if (response.last || page + 1 >= response.totalPages || !response.content.length) return items
  }
}

const names = (name, field = 'name') => ({ [field + 'En']: name || '', [field + 'Ar']: name || '' })
const orderStatus = status => status === 'PENDING' ? 'NEW' : status
const order = entry => ({
  id: entry.id, number: entry.orderNumber, patientId: entry.patientId, patient: names(entry.patientName),
  tests: entry.items.map(item => ({ id: item.id, ...names(item.testName) })),
  status: orderStatus(entry.status), totalCents: Math.round(entry.totalAmount * 100),
  createdAt: entry.createdAt, date: reportDate(entry.createdAt),
})
const orders = async () => (await list('/api/orders')).map(order)
const patient = record => ({
  ...record, ...names(record.fullName), fileNumber: record.patientNumber, phone: record.phoneNumber,
})

export const liveOverview = {
  async load(days) {
    const [dashboard, records] = await Promise.all([get('/api/admin/dashboard', { days }), orders()])
    return { dashboard, orders: records }
  },
}

export const liveUsers = {
  async load({ page, size, search, role, status, sort, recent }) {
    const now = new Date()
    const query = { page, size, sort }
    if (search) query.search = search
    if (role !== 'all') query.role = role
    if (status !== 'all') query.status = status
    if (recent) {
      query.createdTo = now.toISOString()
      query.createdFrom = new Date(now.getTime() - 30 * 86400000).toISOString()
    }
    const result = await get('/api/users/page', query)
    return { ...result, content: result.content.map(user => ({ ...user, name: user.fullName, lastLogin: user.lastLoginAt })) }
  },
  invite: values => write('/api/users', 'POST', values),
  role: (id, role) => write(`/api/users/${id}/role`, 'PUT', { role }),
  block: (id, blocked) => write(`/api/users/${id}/${blocked ? 'block' : 'unblock'}`, 'PATCH'),
  delete: id => write(`/api/users/${id}`, 'DELETE'),
}

export const livePatients = {
  live: true,
  async load() {
    const [patients, records] = await Promise.all([list('/api/patients'), orders()])
    return { patients: patients.map(patient), orders: records.map(entry => ({ ...entry, total: entry.totalCents / 100 })), appointments: [], transactions: [] }
  },
  async save(values, id) {
    const saved = await write('/api/patients' + (id ? `/${id}` : ''), id ? 'PUT' : 'POST', {
      fullName: values.nameEn.trim(), dateOfBirth: values.dateOfBirth, gender: values.gender,
      phoneNumber: values.phone.trim(), address: values.address?.trim() || null,
    })
    return patient(await get(`/api/patients/${saved.id}`))
  },
}

export const liveOperations = {
  live: true,
  async load() { return { orders: await orders(), transactions: [] } },
}

export const liveReports = {
  live: true,
  async load({ from, to }) {
    const report = await get('/api/reports/operations', { fromDate: from, toDate: to })
    const counts = rows => rows.map(row => ({ ...row, status: orderStatus(row.status) }))
    return {
      ordersByStatus: counts(report.ordersByStatus), testsByStatus: counts(report.testsByStatus),
      attendance: report.appointments, rejected: report.rejectedSamples, financial: null,
      empty: !report.ordersByStatus.some(row => row.count) && !report.appointments.scheduled && !report.rejectedSamples,
    }
  },
}

export const liveAudit = {
  live: true,
  async load() {
    return (await list('/api/audit-logs')).map(event => ({
      ...event, timestamp: event.occurredAt || event.recordedAt, actorId: event.actor?.id,
      ...names(event.actor?.name, 'actor'), ...names(event.entityName, 'entity'), ...names(event.details, 'details'),
      entityId: event.entityId || '', requestId: null,
    }))
  },
}

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: SCHEDULING_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const iso = (date, time) => new Date(schedulingInstant(date, time)).toISOString()
const slot = record => ({
  ...record, date: schedulingDate(new Date(record.startsAt)), booked: record.capacity - record.remainingCapacity,
  startTime: clock.format(new Date(record.startsAt)), endTime: clock.format(new Date(record.endsAt)),
})
export const liveSlots = {
  live: true,
  async load(month) {
    const first = `${month}-01`
    const midpoint = `${month}-16`
    const date = new Date(`${first}T12:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + 1)
    const next = date.toISOString().slice(0, 10)
    const firstHalf = await list('/api/appointment-slots/schedule', { from: iso(first, '00:00'), to: iso(midpoint, '00:00') })
    const secondHalf = await list('/api/appointment-slots/schedule', { from: iso(midpoint, '00:00'), to: iso(next, '00:00') })
    return { slots: [...firstHalf, ...secondHalf].map(slot), appointments: [] }
  },
  async save(values, id, original) {
    const capacity = Number(values.capacity)
    const result = id ? await write(`/api/appointment-slots/${id}`, 'PUT', { capacity, active: original.active })
      : await write('/api/appointment-slots', 'POST', {
        startsAt: iso(values.date, values.startTime), endsAt: iso(values.date, values.endTime), capacity, active: true,
      })
    return slot(result)
  },
  async setActive(id, active, original) {
    return slot(await write(`/api/appointment-slots/${id}`, 'PUT', { active, capacity: original.capacity }))
  },
}

const testPath = '/api/lab-tests'
const parameterPath = testId => `${testPath}/${testId}/parameters`
const rangePath = (testId, id) => `${parameterPath(testId)}/${id}/reference-ranges`
const test = record => ({
  ...record, ...names(record.name), ...names(record.description, 'description'),
  ...names(record.preparationInstructions, 'preparation'), priceCents: Math.round(record.price * 100),
})
const parameter = record => ({
  ...record, ...names(record.name), ...names(record.method, 'method'), testId: record.labTestId,
  valueType: record.resultType, historicallyUsed: record.inUse,
})
const range = record => ({ ...record, sex: record.applicability, lower: record.lowerLimit, upper: record.upperLimit })
export const liveCatalog = {
  live: true,
  async load() {
    const tests = (await list(testPath)).map(test)
    const parameters = []
    const ranges = []
    for (const entry of tests) {
      const entries = (await list(parameterPath(entry.id), { includeInactive: true })).map(parameter)
      parameters.push(...entries)
      for (const item of entries) ranges.push(...(await list(rangePath(entry.id, item.id), { includeExpired: true })).map(range))
    }
    return { tests, parameters, ranges }
  },
  async saveTest(values, id) {
    const payload = {
      code: values.code, name: values.nameEn, description: values.descriptionEn,
      price: Number(values.price), currency: 'ILS', sampleType: values.sampleType, preparationInstructions: values.preparationEn,
    }
    // Editing details leaves categories and availability untouched.
    const saved = id ? await write(`${testPath}/${id}/details`, 'PATCH', payload) : await write(testPath, 'POST', { ...payload, categories: [] })
    return test(saved)
  },
  async setTestActive(id, active) {
    return test(await write(`${testPath}/${id}/status`, 'PATCH', { active }))
  },
  async saveParameter(values, testId, id) {
    const path = parameterPath(testId)
    const payload = {
      code: values.code, name: values.nameEn, resultType: values.valueType, unit: values.unit || null, method: values.methodEn || null,
      displayOrder: Number(values.displayOrder), required: values.required, active: values.active,
      ...(id ? { expectedVersion: values.version } : {}),
    }
    const saved = await write(id ? `${path}/${id}` : path, id ? 'PUT' : 'POST', payload)
    return parameter({ ...saved, inUse: id ? values.historicallyUsed : false })
  },
  setParameterActive(id, active, original) {
    return liveCatalog.saveParameter({ ...original, active }, original.testId, id)
  },
  async saveRange(values, id, testId) {
    const fields = rangeFields(values, id)
    return range(await write(rangePath(testId, id), 'POST', {
      applicability: fields.sex, minAgeDays: fields.minAgeDays, maxAgeDays: fields.maxAgeDays,
      lowerLimit: fields.lower, upperLimit: fields.upper, validFrom: fields.validFrom, validTo: fields.validTo,
    }))
  },
}
