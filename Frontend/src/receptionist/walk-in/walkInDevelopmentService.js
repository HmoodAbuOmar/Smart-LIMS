import { adminCatalogService } from '../../admin/catalog/adminCatalogService.js'
import { receptionistPatientsService } from '../patients/patientsService.js'
import { createPatientDemoData } from '../../admin/patients/adminPatientsService.js'
import { reconcileTests, totalCents, validateSelection } from './walkInModel.js'

// Development-only, in memory like R02. No appointment/slot service is imported.
export function createWalkInService({ catalog = adminCatalogService, patients = receptionistPatientsService, beforeCreate = async () => {}, delay = 160, history = createPatientDemoData(), storage } = {}) {
  const storageKey = 'smart-lims.receptionist-orders.v1'
  let stored = []
  try { const value = JSON.parse(storage?.getItem(storageKey) || '[]'); if (Array.isArray(value) && value.every(entry => entry.length === 2 && entry[1]?.order?.id)) stored = value } catch { /* No usable local snapshot. */ }
  const orders = new Map(stored)
  let sequence = 0
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  const existingOrders = () => history.orders.map(order => ({ ...order, orderNumber: order.number.replace(/^DEMO-/, ''), totalAmount: order.total, currency: 'ILS' }))
  const allOrders = () => [...existingOrders(), ...[...orders.values()].map(entry => entry.order)]
  return {
    async listAllOrders() { await wait(); return structuredClone(allOrders()) },
    async getOrder(id) {
      await wait()
      const order = allOrders().find(record => record.id === id)
      if (!order) { const error = new Error('Order not found'); error.code = 'ORDER_NOT_FOUND'; throw error }
      return structuredClone({ ...order, appointments: history.appointments.filter(record => record.orderId === id), transactions: history.transactions?.filter(record => record.orderId === id) || [] })
    },
    async getPatient(id) {
      const patient = (await patients.list({ size: 10000 })).content.find(record => record.id === id)
      if (!patient) throw new Error('Patient not found')
      return structuredClone(patient)
    },
    async listOrders(patientId) {
      await wait()
      return structuredClone(allOrders().filter(order => order.patientId === patientId))
    },
    async listAppointments(patientId) { await wait(); return structuredClone(history.appointments.filter(appointment => appointment.patientId === patientId)) },
    async listTests() { return structuredClone((await catalog.load()).tests) },
    async create(request) {
      await wait()
      const { patientId, testIds, idempotencyKey, quotedTests, notes, source } = request
      const fingerprint = JSON.stringify({ patientId, testIds: [...testIds].sort(), notes, source })
      const prior = orders.get(idempotencyKey)
      if (prior) {
        if (prior.fingerprint !== fingerprint) { const error = new Error('Different request'); error.code = 'invalidSelection'; throw error }
        return structuredClone(prior.order)
      }
      const patient = (await patients.list({ size: 10000 })).content.find(item => item.id === patientId)
      const fresh = (await catalog.load()).tests
      const selected = testIds.map(id => fresh.find(test => test.id === id))
      const fail = code => { const error = new Error(code); error.code = code; throw error }
      if (!idempotencyKey || source !== 'WALK_IN') fail('invalidSelection')
      const error = validateSelection(patient, selected)
      if (error) fail(error)
      const checked = reconcileTests(quotedTests, fresh)
      if (checked.changed.length) fail('pricesChanged')
      await beforeCreate(request)
      // The injected save boundary can pause or fail; recheck before recording.
      const finalTests = (await catalog.load()).tests
      const finalCheck = reconcileTests(selected, finalTests)
      if (finalCheck.unavailable.length) fail('testUnavailable')
      if (finalCheck.changed.length) fail('pricesChanged')
      // A concurrent replay may have completed while the request was waiting.
      if (orders.has(idempotencyKey)) return structuredClone(orders.get(idempotencyKey).order)
      do { sequence++ } while (allOrders().some(order => order.id === `r05-order-${sequence}` || order.orderNumber === `ORD-${String(sequence).padStart(6, '0')}`))
      const order = { id: `r05-order-${sequence}`, orderNumber: `ORD-${String(sequence).padStart(6, '0')}`, patientId, source: 'WALK_IN', notes: notes?.trim() || '', status: 'PENDING', createdAt: new Date().toISOString(), currency: 'ILS', totalAmount: totalCents(selected) / 100,
        items: selected.map(test => ({ labTestId: test.id, testCode: test.code, testName: test.nameEn, nameEn: test.nameEn, nameAr: test.nameAr, priceAtOrder: test.priceCents / 100 })) }
      const next = new Map(orders)
      next.set(idempotencyKey, { fingerprint, order })
      storage?.setItem(storageKey, JSON.stringify([...next]))
      orders.set(idempotencyKey, { fingerprint, order })
      return structuredClone(order)
    },
  }
}
