import { todayService } from '../today/todayService.js'
import { walkInService } from '../walk-in/walkInService.js'
import { requestServiceOperation } from '../../services/serviceTransport.js'
import { bookableOrder } from './appointmentsModel.js'

// Confirmed backend action contracts. There is no staff daily-list contract.
export const appointmentsApi = {
  types: () => requestServiceOperation('appointmentTypes', { method: 'GET', path: '/api/appointment-types' }),
  slots: query => requestServiceOperation('appointmentSlots', { method: 'GET', path: '/api/appointment-slots', query }),
  alternatives: (id, query) => requestServiceOperation('appointmentAlternatives', { method: 'GET', path: `/api/appointments/${encodeURIComponent(id)}/alternatives`, query }),
  book: (body, key) => requestServiceOperation('appointmentBook', { method: 'POST', path: '/api/appointments', headers: { 'Idempotency-Key': key }, body }),
  move: (id, slotId, expectedVersion) => requestServiceOperation('appointmentMove', { method: 'POST', path: `/api/appointments/${encodeURIComponent(id)}/reschedule`, body: { slotId, expectedVersion } }),
  cancel: (id, reason) => requestServiceOperation('appointmentCancel', { method: 'POST', path: `/api/appointments/${encodeURIComponent(id)}/cancel`, body: { reason: reason.trim() } }),
  arrive: record => requestServiceOperation('appointmentArrival', { method: 'POST', path: '/api/visits', body: { orderId: record.orderId, appointmentId: record.id, orderItemIds: record.orderItemIds, arrivedAt: new Date().toISOString() } }),
}
export const appointmentsService = {
  load: date => todayService.day(date), slots: date => todayService.slots(date),
  orders: async () => {
    const [orders, appointments] = await Promise.all([walkInService.listAllOrders(), todayService.load()])
    return Promise.all(orders.filter(order => bookableOrder(order, appointments)).map(async order => ({ ...order, patient: await walkInService.getPatient(order.patientId) })))
  },
  book: async ({ orderId, slotId, typeId, idempotencyKey }) => {
    const order = await walkInService.getOrder(orderId), patient = await walkInService.getPatient(order.patientId)
    return todayService.book({ order, patient, slotId, typeId, idempotencyKey })
  },
  reschedule: (record, slotId) => todayService.reschedule(record.id, slotId, record.version),
  cancel: (record, reason) => todayService.cancel(record.id, reason, record.version),
  checkIn: record => todayService.checkIn(record.id, record.version),
}
