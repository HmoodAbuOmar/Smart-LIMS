import { createPatientDemoData } from '../../admin/patients/adminPatientsService.js'
import { filterPatients, PAGE_SIZE, patientPayload, validateNewPatient } from './patientsModel.js'

export function createReceptionistPatientsService({ initial, delay = 160, beforeCreate = async () => {}, now = () => new Date() } = {}) {
  const data = structuredClone(initial ?? createPatientDemoData().patients.map((patient, index) => ({
    id: patient.id, patientNumber: patient.fileNumber, fullName: patient.nameEn, nameEn: patient.nameEn, nameAr: patient.nameAr,
    dateOfBirth: patient.dateOfBirth, gender: patient.gender, phoneNumber: patient.phone, address: null,
    linkedAccountId: patient.linkedAccountId, createdAt: new Date(now().getTime() - index * 86400000).toISOString(),
  })))
  let sequence = 9000
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  return {
    async list({ search = '', page = 0, size = PAGE_SIZE } = {}, { signal } = {}) {
      await wait(); signal?.throwIfAborted()
      const matches = filterPatients(data, search).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      const totalPages = Math.ceil(matches.length / size)
      return structuredClone({ content: matches.slice(page * size, (page + 1) * size), page, size, totalElements: matches.length, totalPages, first: page === 0, last: page >= totalPages - 1 })
    },
    async create(values) {
      await wait()
      const fields = validateNewPatient(values)
      if (Object.keys(fields).length) { const error = new Error('Validation failed'); error.fields = fields; throw error }
      await beforeCreate(values)
      let patientNumber, id
      do { sequence++; patientNumber = `PAT-${String(sequence).padStart(6, '0')}`; id = `r02-patient-${sequence}` } while (data.some(patient => patient.patientNumber === patientNumber || patient.id === id))
      const patient = { ...patientPayload(values), id, patientNumber, linkedAccountId: null, createdAt: now().toISOString() }
      data.push(patient)
      return structuredClone(patient)
    },
  }
}
