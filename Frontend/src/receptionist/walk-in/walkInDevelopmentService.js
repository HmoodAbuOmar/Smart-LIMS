import { createCatalogData } from '../../admin/catalog/adminCatalogService.js'
import { adminCatalogService } from '../../admin/catalog/adminCatalogService.js'
import { receptionistPatientsService } from '../patients/patientsService.js'
import { createPatientDemoData } from '../../admin/patients/adminPatientsService.js'
import { reconcileTests, totalCents, validateSelection } from './walkInModel.js'
import { eligibleBalance, paymentMethods } from '../payments/paymentsModel.js'

// Development-only, in memory like R02. No appointment/slot service is imported.
export function createWalkInService({ catalog = adminCatalogService, patients = receptionistPatientsService, beforeCreate = async () => {}, delay = 160, history = createPatientDemoData(), storage, previewOrders = false, cascadeCancellation = (_id, _reason, commit) => commit() } = {}) {
  const storageKey = 'smart-lims.receptionist-orders.v1'
  let stored = []
  try { const value = JSON.parse(storage?.getItem(storageKey) || '[]'); if (Array.isArray(value) && value.every(entry => entry.length === 2 && entry[1]?.order?.id)) stored = value } catch { /* No usable local snapshot. */ }
  const orders = new Map(stored)
  const paymentKey = 'smart-lims.receptionist-payments.v1'
  let payments = []
  try {
    const value = JSON.parse(storage?.getItem(paymentKey) || '[]')
    if (Array.isArray(value)) payments = value
  } catch { /* No usable local snapshot. */ }
  if (previewOrders) {
    const tests = createCatalogData().tests
    for (let index = 0; index < 2; index++) {
      const key = `preview-pending-${index + 1}`
      if (orders.has(key)) continue
      const test = tests[index]
      const order = { id: key, orderNumber: `ORD-00700${index + 1}`, patientId: `demo-patient-${index + 1}`, status: 'PENDING', createdAt: '2026-11-15T08:00:00Z', currency: 'ILS', totalAmount: test.priceCents / 100,
        items: [{ labTestId: test.id, testCode: test.code, testName: test.nameEn, nameEn: test.nameEn, nameAr: test.nameAr, priceAtOrder: test.priceCents / 100 }] }
      orders.set(key, { fingerprint: key, order })
    }
  }
  let sequence = 0
  const wait = () => new Promise(resolve => setTimeout(resolve, delay))
  const existingOrders = () => history.orders.map(order => ({ ...order, orderNumber: order.number.replace(/^DEMO-/, ''), totalAmount: order.total, currency: 'ILS' }))
  const allOrders = () => [...existingOrders(), ...[...orders.values()].map(entry => entry.order)]
  const transactions = id => [...(history.transactions || []), ...payments].filter(record => record.orderId === id)
  const withTransactions = order => ({ ...order, transactions: transactions(order.id) })
  const fail = code => { const error = new Error(code); error.code = code; throw error }
  return {
    async listPaymentOrders() {
      await wait()
      return structuredClone(allOrders().map(withTransactions))
    },
    async recordPayment({ orderId, amountCents, method, idempotencyKey }) {
      await wait()
      if (!idempotencyKey || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !paymentMethods.includes(method)) fail('invalidPayment')
      const prior = payments.find(entry => entry.idempotencyKey === idempotencyKey)
      if (prior) {
        if (prior.orderId !== orderId || prior.amountCents !== amountCents || prior.method !== method) fail('invalidPayment')
        return structuredClone(prior)
      }
      const order = allOrders().find(record => record.id === orderId)
      const balance = order && eligibleBalance(withTransactions(order))
      if (!balance || amountCents > balance.outstanding) fail('balanceChanged')
      const recordedAt = new Date().toISOString()
      const transaction = {
        id: idempotencyKey, idempotencyKey, orderId, receiptNumber: `RCP-${payments.length + 1}`,
        type: 'PAYMENT', status: 'CONFIRMED', method, amount: amountCents / 100, amountCents,
        currency: 'ILS', recordedAt, confirmedAt: recordedAt,
      }
      const next = [...payments, transaction]
      storage?.setItem(paymentKey, JSON.stringify(next))
      payments = next
      return structuredClone(transaction)
    },
    async cancelOrder(id, reason) {
      await wait()
      if (!reason?.trim() || reason.trim().length > 1000) { const error = new Error('Cancellation reason required'); error.code = 'REASON_REQUIRED'; throw error }
      const entry = [...orders.entries()].find(([, entry]) => entry.order.id === id)
      if (entry?.[1].order.status === 'CANCELLED') return structuredClone(entry[1].order)
      if (!entry || entry[1].order.status !== 'PENDING') { const error = new Error('Order cannot be cancelled'); error.code = 'ORDER_NOT_CANCELLABLE'; throw error }
      const [key, saved] = entry, order = { ...saved.order, status: 'CANCELLED', cancellationReason: reason.trim(), cancelledAt: new Date().toISOString() }
      return cascadeCancellation(id, reason.trim(), () => {
        const next = new Map(orders); next.set(key, { ...saved, order })
        storage?.setItem(storageKey, JSON.stringify([...next])); orders.set(key, { ...saved, order }); return structuredClone(order)
      })
    },
    async listAllOrders() { await wait(); return structuredClone(allOrders()) },
    async getOrder(id) {
      await wait()
      const order = allOrders().find(record => record.id === id)
      if (!order) { const error = new Error('Order not found'); error.code = 'ORDER_NOT_FOUND'; throw error }
      return structuredClone({ ...withTransactions(order), appointments: history.appointments.filter(record => record.orderId === id) })
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
      if (!idempotencyKey || (source !== undefined && source !== 'WALK_IN')) fail('invalidSelection')
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
      const order = { id: `r05-order-${sequence}`, orderNumber: `ORD-${String(sequence).padStart(6, '0')}`, patientId, source, notes: notes?.trim() || '', status: 'PENDING', createdAt: new Date().toISOString(), currency: 'ILS', totalAmount: totalCents(selected) / 100,
        items: selected.map(test => ({ labTestId: test.id, testCode: test.code, testName: test.nameEn, nameEn: test.nameEn, nameAr: test.nameAr, priceAtOrder: test.priceCents / 100 })) }
      const next = new Map(orders)
      next.set(idempotencyKey, { fingerprint, order })
      storage?.setItem(storageKey, JSON.stringify([...next]))
      orders.set(idempotencyKey, { fingerprint, order })
      return structuredClone(order)
    },
  }
}
