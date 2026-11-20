import assert from 'node:assert/strict'
import { balances } from './ordersModel.js'
import { createWalkInService } from '../walk-in/walkInDevelopmentService.js'
import { createReceptionistPatientsService } from '../patients/patientsDevelopmentService.js'
import { createCatalogData } from '../../admin/catalog/adminCatalogService.js'
import { ordersCopy } from './ordersCopy.js'
import { paymentCents } from '../payments/paymentsModel.js'

const memory = new Map(), storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) }
const patients = createReceptionistPatientsService({ storage, delay: 0 })
const values = { fullName: 'New Order Patient', dateOfBirth: '2000-01-02', gender: 'UNKNOWN', phoneNumber: '0599000111', address: '' }
const patient = await patients.create(values)
const restoredPatients = createReceptionistPatientsService({ storage, delay: 0 })
assert.equal((await restoredPatients.list({ search: patient.patientNumber })).content[0].id, patient.id)
const catalog = { load: async () => createCatalogData() }
let writes = 0
const service = createWalkInService({ patients: restoredPatients, catalog, storage, delay: 0, beforeCreate: async () => { writes++ } })
const existing = await service.getOrder('demo-patient-order-1')
assert.deepEqual(balances(existing), { total: 15000, paid: 13000, outstanding: 2000, receipts: 15000, refunds: 2000 })
assert.equal(balances(await service.getOrder('demo-patient-order-2')).paid, 0)
assert.equal(balances(await service.getOrder('demo-patient-order-3')).paid, 0)
assert.equal(existing.appointments.length, 1)
assert.equal(existing.items, undefined) // Missing snapshots stay unavailable.
assert.equal(balances({}), null)
const test = (await service.listTests())[0]
const request = { patientId: patient.id, source: 'WALK_IN', notes: 'Preserved', testIds: [test.id], quotedTests: [test], idempotencyKey: crypto.randomUUID() }
const saved = await service.create(request)
assert.equal(writes, 1)
const count = (await service.listAllOrders()).length
const restored = createWalkInService({ patients: restoredPatients, catalog, storage, delay: 0, beforeCreate: async () => { writes++ } })
assert.equal((await restored.getOrder(saved.id)).patientId, patient.id)
assert.equal((await restored.getOrder(saved.id)).items[0].priceAtOrder, 25)
assert.equal((await restored.getOrder(saved.id)).appointments.length, 0)
assert.equal((await restored.getOrder(saved.id)).transactions.length, 0)
assert.equal((await restored.create(request)).id, saved.id)
assert.equal((await restored.listAllOrders()).length, count)
assert.equal(writes, 1) // All reads and idempotent replay leave records unchanged.
await assert.rejects(restored.getOrder('missing'), { code: 'ORDER_NOT_FOUND' })
assert.equal((await restored.getPatient(patient.id)).id, patient.id)
assert.deepEqual(Object.keys(ordersCopy.en).sort(), Object.keys(ordersCopy.ar).sort())
assert.equal(paymentCents('١٢٫٣٤'), 1234)
assert.equal(paymentCents('1.001'), null)
assert.equal(paymentCents('0'), null)
const payment = { orderId: existing.id, amountCents: 1200, method: 'CASH', idempotencyKey: 'payment-a' }
const [firstPayment, duplicate] = await Promise.all([service.recordPayment(payment), service.recordPayment(payment)])
assert.deepEqual(firstPayment, duplicate)
await assert.rejects(service.recordPayment({ ...payment, amountCents: 1300 }), { code: 'invalidPayment' })
await assert.rejects(service.recordPayment({ ...payment, idempotencyKey: 'payment-b' }), { code: 'balanceChanged' })
await assert.rejects(service.recordPayment({ ...payment, orderId: 'demo-patient-order-4', idempotencyKey: 'payment-c' }), { code: 'balanceChanged' })
const withPayments = createWalkInService({ storage, delay: 0 })
assert.equal(balances(await withPayments.getOrder(existing.id)).outstanding, 800)
assert.deepEqual((await withPayments.listPaymentOrders()).find(order => order.id === existing.id).transactions.at(-1), firstPayment)
console.log('PASS: confirmed payments/refunds, pending/failed exclusion, patient and order session reload, immutable price snapshots, linked appointments, unavailable item snapshots, ID lookup, no creation on reads/replay and bilingual keys.')
