import { authenticatedRequest } from '../auth/cookieSession.js'
import { schedulingInstant } from '../admin/bookingSlots/bookingSlotsModel.js'
import { listApi, queryApi } from '../services/apiQuery.js'
import { patientPayload } from './patients/patientsModel.js'
import { formatTime, todayDate } from './today/todayModel.js'

const write = (path, body, requestId) => authenticatedRequest(path, { method: 'POST', body, requestId })

function nextDate(date) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function dayRange(date) {
  const start = schedulingInstant(date, '00:00')
  const end = schedulingInstant(nextDate(date), '00:00')
  if (start == null || end == null) return null
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

function moneyNumber(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function namedPatient(record) {
  const name = record.fullName || record.patientName || ''
  return {
    id: record.id || record.patientId,
    patientNumber: record.patientNumber,
    fileNumber: record.fileNumber || record.patientNumber || '',
    fullName: name,
    nameEn: name,
    nameAr: name,
    dateOfBirth: record.dateOfBirth,
    gender: record.gender,
    phoneNumber: record.phoneNumber,
    address: record.address,
    linkedAccountId: record.linkStatus === 'LINKED' ? record.id : null,
  }
}

function mapPatient(record) {
  return namedPatient(record)
}

function mapTransaction(entry) {
  return {
    id: entry.id,
    receiptNumber: entry.receiptNumber,
    reference: entry.receiptNumber,
    orderId: entry.orderId,
    type: entry.type,
    status: entry.status,
    method: entry.method,
    amount: moneyNumber(entry.amount),
    currency: entry.currency,
    recordedAt: entry.recordedAt,
    confirmedAt: entry.confirmedAt,
    transactionAt: entry.transactionAt,
  }
}

function mapToday(row) {
  const patient = namedPatient(row.patient || {})
  return {
    ...row,
    status: row.status === 'CONFIRMED' ? 'BOOKED' : row.status,
    orderItemIds: row.orderItemIds || [],
    patient,
  }
}

function mapAppointment(row) {
  const patient = namedPatient(row.patient || {})
  return {
    ...row,
    status: row.status === 'CONFIRMED' ? 'BOOKED' : row.status,
    orderStatus: row.canReschedule ? 'PENDING' : undefined,
    orderItemIds: row.orderItemIds || [],
    booked: Number(row.booked ?? 0),
    capacity: Number(row.capacity ?? 0),
    patient,
  }
}

function mapOrderDetail(detail, transactions) {
  const order = detail.order
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    patientId: order.patientId,
    status: order.status,
    createdAt: order.createdAt,
    totalAmount: moneyNumber(order.totalAmount),
    currency: order.currency,
    items: (detail.items || []).map(item => ({
      ...item,
      name: item.testName,
      priceAtOrder: moneyNumber(item.priceAtOrder),
    })),
    appointments: (detail.appointments || []).map(appointment => ({
      ...appointment,
      orderId: order.id,
      status: appointment.status === 'CONFIRMED' ? 'BOOKED' : appointment.status,
    })),
    transactions,
  }
}

function mapTest(test) {
  return {
    ...test,
    nameEn: test.name,
    nameAr: test.name,
    priceCents: Math.round(Number(test.price) * 100),
  }
}

function localAppointment(appointment, patientId) {
  const startsAt = appointment.startsAt
  return {
    id: appointment.id,
    patientId,
    status: appointment.status === 'CONFIRMED' ? 'BOOKED' : appointment.status,
    date: startsAt ? todayDate(new Date(startsAt)) : '',
    time: startsAt ? formatTime(startsAt, 'en') : '',
    startsAt,
  }
}

async function todayRows(date = todayDate()) {
  const response = await queryApi('/api/appointments/today', { date })
  return (response.content || []).map(mapToday)
}

async function refreshToday(id, fallback) {
  const updated = (await todayRows()).find(row => row.id === id)
  return updated || fallback
}

export const liveToday = {
  load: () => todayRows(),
  async checkIn(id, version) {
    const row = (await todayRows()).find(item => item.id === id)
    if (!row?.orderId || !row.orderItemIds?.length) {
      const error = new Error('Check-in is not eligible')
      error.code = 'APPOINTMENT_STATE_CONFLICT'
      throw error
    }
    await write('/api/visits', {
      orderId: row.orderId,
      appointmentId: id,
      orderItemIds: row.orderItemIds,
      arrivedAt: new Date().toISOString(),
      expectedAppointmentVersion: Number(version),
    }, crypto.randomUUID())
    return refreshToday(id, { ...row, status: 'CHECKED_IN', arrivedAt: new Date().toISOString() })
  },
  async markNoShow(id, version) {
    const row = (await todayRows()).find(item => item.id === id)
    await write(`/api/appointments/${encodeURIComponent(id)}/no-show`, { expectedVersion: Number(version) })
    return refreshToday(id, row ? { ...row, status: 'NO_SHOW' } : { id, status: 'NO_SHOW', patient: namedPatient({}) })
  },
}

export const livePatients = {
  async list(query = {}, options) {
    const page = await queryApi('/api/patients', {
      search: query.search || undefined,
      page: query.page,
      size: query.size,
      sort: query.sort,
    }, options)
    return {
      ...page,
      totalElements: Math.trunc(Number(page.totalElements)),
      totalPages: Math.trunc(Number(page.totalPages)),
      content: (page.content || []).map(mapPatient),
    }
  },
  async create(values, options) {
    const saved = await authenticatedRequest('/api/patients', { method: 'POST', body: patientPayload(values), signal: options?.signal })
    return mapPatient(saved)
  },
}

async function readOrder(id) {
  const [detail, transactions] = await Promise.all([
    queryApi(`/api/receptionist/orders/${encodeURIComponent(id)}`),
    listApi('/api/receptionist/payments', { orderId: id }),
  ])
  return mapOrderDetail(detail, transactions.map(mapTransaction))
}

export const liveWalkIn = {
  listAllOrders: () => listApi('/api/receptionist/orders').then(rows => rows.map(row => ({
    ...row,
    totalAmount: moneyNumber(row.totalAmount),
  }))),
  getOrder: id => readOrder(id),
  getPatient: async id => mapPatient(await queryApi(`/api/patients/${encodeURIComponent(id)}`)),
  async listOrders(patientId) {
    const rows = await listApi('/api/receptionist/orders')
    return rows.filter(row => row.patientId === patientId).map(row => ({ ...row, totalAmount: moneyNumber(row.totalAmount) }))
  },
  async listAppointments(patientId) {
    const orders = await liveWalkIn.listOrders(patientId)
    const details = await Promise.all(orders.map(order => queryApi(`/api/receptionist/orders/${encodeURIComponent(order.id)}`)))
    return details.flatMap(detail => (detail.appointments || []).map(appointment => localAppointment(appointment, patientId)))
  },
  async listTests() {
    const tests = await listApi('/api/lab-tests')
    return tests.map(mapTest)
  },
  async create({ patientId, testIds, idempotencyKey }) {
    return write('/api/orders', { patientId, testIds: [...testIds] }, idempotencyKey)
  },
  createPending(request) {
    return liveWalkIn.create(request)
  },
  cancelOrder: (id, reason) => write(`/api/orders/${encodeURIComponent(id)}/cancel`, { reason }),
  async listPaymentOrders() {
    const [payments, eligible] = await Promise.all([
      listApi('/api/receptionist/payments'),
      listApi('/api/receptionist/payments/eligible-orders'),
    ])
    const orders = new Map()
    for (const entry of payments) {
      const current = orders.get(entry.orderId) || {
        id: entry.orderId,
        orderNumber: entry.orderNumber,
        patientId: entry.patientId,
        currency: entry.currency || 'ILS',
        status: 'PENDING',
        totalAmount: null,
        transactions: [],
      }
      current.transactions.push(mapTransaction(entry))
      orders.set(entry.orderId, current)
    }
    for (const entry of eligible) {
      const current = orders.get(entry.orderId) || {
        id: entry.orderId,
        orderNumber: entry.orderNumber,
        patientId: entry.patientId,
        status: 'PENDING',
        transactions: [],
      }
      current.orderNumber = entry.orderNumber
      current.patientId = entry.patientId
      current.currency = entry.balance?.currency || current.currency || 'ILS'
      current.totalAmount = moneyNumber(entry.balance?.total)
      current.status = 'PENDING'
      orders.set(entry.orderId, current)
    }
    return [...orders.values()]
  },
  async recordPayment(request) {
    try {
      const saved = await write('/api/receptionist/payments', {
        orderId: request.orderId,
        amount: Number((request.amountCents / 100).toFixed(2)),
        method: request.method,
      }, request.idempotencyKey)
      return mapTransaction(saved.transaction)
    } catch (error) {
      if (error?.code === 'PAYMENT_EXCEEDS_OUTSTANDING' || error?.code === 'ORDER_NOT_PAYABLE') error.code = 'balanceChanged'
      throw error
    }
  },
}

export const liveAppointments = {
  async load(date) {
    const rows = await listApi('/api/receptionist/appointments', { date })
    return rows.map(mapAppointment)
  },
  async slots(date, orderId, appointmentId) {
    const range = dayRange(date)
    if (!range || (!appointmentId && !orderId)) return []
    const path = appointmentId ? `/api/appointments/${encodeURIComponent(appointmentId)}/alternatives` : '/api/appointment-slots'
    const params = appointmentId ? range : { orderId, ...range }
    const slots = await listApi(path, params)
    return slots.map(slot => ({
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: Number(slot.capacity),
      remainingCapacity: Number(slot.remainingCapacity),
      active: slot.active !== false,
    }))
  },
  async orders() {
    const rows = await listApi('/api/receptionist/orders', { bookable: 'true' })
    return rows.filter(row => row.status === 'PENDING' && row.testCount > 0).map(row => ({
      id: row.id,
      orderNumber: row.orderNumber,
      patientId: row.patientId,
      status: row.status,
      items: [{ id: row.id }],
      patient: namedPatient({ id: row.patientId, patientNumber: row.patientNumber, patientName: row.patientName }),
    }))
  },
  book: ({ orderId, slotId, idempotencyKey }) => write('/api/appointments', { orderId, slotId }, idempotencyKey),
  reschedule: (record, slotId) => write(`/api/appointments/${encodeURIComponent(record.id)}/reschedule`, {
    slotId, expectedVersion: Number(record.version),
  }),
  cancel: (record, reason) => write(`/api/appointments/${encodeURIComponent(record.id)}/cancel`, { reason }),
  async checkIn(record) {
    const saved = await liveToday.checkIn(record.id, record.version)
    return { ...record, ...saved, id: record.id, status: saved.status }
  },
}
