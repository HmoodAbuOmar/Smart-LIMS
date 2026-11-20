import { requestServiceOperation } from '../../services/serviceTransport.js'
import { staffOrderPayload } from './walkInModel.js'
import { todayService } from '../today/todayService.js'

// Existing read contracts only. Unknown request fields are deliberately not sent.
export const staffOrderApi = {
  cancelOrder: (id, reason) => requestServiceOperation('staffOrderCancel', { method: 'POST', path: `/api/orders/${encodeURIComponent(id)}/cancel`, body: { reason } }),
  getPatient: id => requestServiceOperation('staffPatientGet', { method: 'GET', path: `/api/patients/${encodeURIComponent(id)}` }),
  listTests: query => requestServiceOperation('staffTestList', { method: 'GET', path: '/api/lab-tests', query }),
  getTest: id => requestServiceOperation('staffTestGet', { method: 'GET', path: `/api/lab-tests/${encodeURIComponent(id)}` }),
  create: ({ patientId, testIds, idempotencyKey }) => requestServiceOperation('staffOrderCreate', {
    method: 'POST', path: '/api/orders', headers: { 'Idempotency-Key': idempotencyKey }, body: staffOrderPayload(patientId, testIds),
  }),
}
let development
async function source() {
  if (!import.meta.env?.DEV) { const error = new Error('Walk-in contract and staff transport unavailable'); error.code = 'SERVICE_UNAVAILABLE'; throw error }
  development ??= import('./walkInDevelopmentService.js').then(module => module.createWalkInService({ storage: window.sessionStorage, previewOrders: true, cascadeCancellation: (...args) => todayService.cancelForOrder(...args) }))
  return development
}
export const walkInService = {
  listPaymentOrders: () => source().then(service => service.listPaymentOrders()),
  recordPayment: request => source().then(service => service.recordPayment(request)),
  cancelOrder: (id, reason) => source().then(service => service.cancelOrder(id, reason)),
  listAllOrders: () => source().then(service => service.listAllOrders()),
  getOrder: async id => {
    const service = await source(), appointments = await todayService.load()
    try {
      const order = await service.getOrder(id)
      return { ...order, appointments: [...(order.appointments || []), ...appointments.filter(record => record.orderId === id)] }
    } catch (error) {
      if (error.code !== 'ORDER_NOT_FOUND') throw error
      const record = appointments.find(record => record.orderId === id)
      if (!record) throw error
      // R01 fixtures contain only an order reference. Missing fields remain unavailable.
      return { id, orderNumber: record.orderNumber, patientId: record.patient.id, totalAmount: null, currency: 'ILS', status: record.orderStatus, appointments: appointments.filter(item => item.orderId === id), transactions: undefined }
    }
  },
  getPatient: async id => {
    const service = await source()
    try { return await service.getPatient(id) } catch (error) {
      const record = (await todayService.load()).find(record => record.patient.id === id)
      if (!record) throw error
      return { ...record.patient, patientNumber: record.patient.fileNumber, fullName: record.patient.nameEn }
    }
  },
  listOrders: id => source().then(service => service.listOrders(id)),
  listAppointments: id => source().then(service => service.listAppointments(id)),
  listTests: () => source().then(service => service.listTests()),
  createPending: request => source().then(service => service.create({ ...request, source: undefined })),
  create: request => source().then(service => service.create(request)),
}
