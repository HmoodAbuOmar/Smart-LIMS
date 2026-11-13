import { requestServiceOperation } from '../../services/serviceTransport.js'
import { staffOrderPayload } from './walkInModel.js'

// Existing read contracts only. Unknown request fields are deliberately not sent.
export const staffOrderApi = {
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
  development ??= import('./walkInDevelopmentService.js').then(module => module.createWalkInService())
  return development
}
export const walkInService = {
  getPatient: id => source().then(service => service.getPatient(id)),
  listOrders: id => source().then(service => service.listOrders(id)),
  listAppointments: id => source().then(service => service.listAppointments(id)),
  listTests: () => source().then(service => service.listTests()),
  create: request => source().then(service => service.create(request)),
}
