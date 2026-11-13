import { requestServiceOperation } from '../../services/serviceTransport.js'
import { patientPayload } from './patientsModel.js'

// Existing backend contracts, routed through the existing unconfigured transport.
// No fetch, guessed credentials, patient-owned endpoint, or linking operation.
export const receptionistPatientsApi = {
  list: (query, options) => requestServiceOperation('staffPatientList', { method: 'GET', path: '/api/patients', query }, options),
  create: (values, options) => requestServiceOperation('staffPatientCreate', { method: 'POST', path: '/api/patients', body: patientPayload(values) }, options),
}
let previewService
async function source() {
  if (!import.meta.env?.DEV) return receptionistPatientsApi
  previewService ??= import('./patientsDevelopmentService.js').then(module => module.createReceptionistPatientsService())
  return previewService
}
export const receptionistPatientsService = {
  list: async (query, options) => (await source()).list(query, options),
  create: async (values, options) => (await source()).create(values, options),
}
