import assert from 'node:assert/strict'
import { createWalkInService } from './walkInDevelopmentService.js'
import { createReceptionistPatientsService } from '../patients/patientsDevelopmentService.js'
import { createCatalogData } from '../../admin/catalog/adminCatalogService.js'
import { reconcileTests, staffOrderPayload, testMatches, testName, totalCents, validateSelection } from './walkInModel.js'
import { walkInCopy } from './walkInCopy.js'
import { staffOrderApi, walkInService } from './walkInService.js'

const data = createCatalogData(), patients = createReceptionistPatientsService({ delay: 0 })
const patient = (await patients.list()).content[0], test = data.tests[0]
const catalog = { load: async () => structuredClone(data) }
const service = createWalkInService({ patients, catalog, delay: 0, history: { orders: [], appointments: [] } })
const historyService = createWalkInService({ patients, catalog, delay: 0 })
assert.equal((await historyService.listOrders(patient.id)).length, 4)
assert.equal((await historyService.listAppointments(patient.id)).length, 5)
assert.equal((await historyService.listAppointments('another-patient')).length, 0)
const request = { patientId: patient.id, testIds: [test.id], source: 'WALK_IN', notes: 'Keep entered notes', quotedTests: [structuredClone(test)], idempotencyKey: crypto.randomUUID() }
assert.equal(validateSelection(null, [test]), 'choosePatient')
assert.equal(validateSelection(patient, []), 'chooseTests')
assert.equal(validateSelection(patient, [test, test]), 'invalidSelection')
assert.equal(validateSelection(patient, [undefined]), 'testUnavailable')
assert.equal(testName(test, 'ar'), test.nameAr)
assert.ok(testMatches(test, test.nameAr)); assert.ok(testMatches(test, test.nameEn)); assert.ok(testMatches(test, 'cbc'))
assert.equal(totalCents([test]), 2500)
assert.deepEqual(staffOrderPayload(patient.id, [test.id]), { patientId: patient.id, testIds: [test.id] })
data.tests[0].priceCents += 500
assert.equal(reconcileTests(request.quotedTests, data.tests).changed.length, 1)
await assert.rejects(service.create(request), { code: 'pricesChanged' })
request.quotedTests = [structuredClone(data.tests[0])]
data.tests[0].active = false
await assert.rejects(service.create(request), { code: 'testUnavailable' })
data.tests[0].active = true
await assert.rejects(service.create({ ...request, patientId: 'not-a-patient' }), { code: 'choosePatient' })
await assert.rejects(service.create({ ...request, testIds: [test.id, test.id] }), { code: 'invalidSelection' })
const failed = createWalkInService({ patients, catalog, delay: 0, beforeCreate: async () => { throw new Error('offline') } })
await assert.rejects(failed.create(request), /offline/)
const [saved, replay] = await Promise.all([service.create(request), service.create(request)])
assert.equal(saved.id, replay.id)
assert.equal(saved.source, 'WALK_IN'); assert.equal(saved.notes, request.notes)
assert.equal(saved.totalAmount, 30); assert.equal(saved.patientId, patient.id)
assert.equal(saved.appointmentId, undefined); assert.equal(saved.slotId, undefined)
assert.equal(saved.items[0].priceAtOrder, 30)
assert.equal((await service.getPatient(patient.id)).id, patient.id)
await assert.rejects(service.getPatient('missing-patient'))
assert.equal((await service.listOrders(patient.id)).length, 1)
assert.equal((await service.listOrders('another-patient')).length, 0)
const profileOrders = await service.listOrders(patient.id)
profileOrders[0].orderNumber = 'Changed externally'
assert.equal((await service.listOrders(patient.id))[0].orderNumber, saved.orderNumber)
data.tests[0].priceCents = 5000
assert.equal((await service.create(request)).totalAmount, 30) // Immutable original snapshot on replay.
await assert.rejects(service.create({ ...request, notes: 'different' }), { code: 'invalidSelection' })
assert.deepEqual(Object.keys(walkInCopy.en).sort(), Object.keys(walkInCopy.ar).sort())
await assert.rejects(staffOrderApi.create(request), { code: 'SERVICE_UNAVAILABLE' })
await assert.rejects(walkInService.create(request), { code: 'SERVICE_UNAVAILABLE' })
console.log('PASS: explicit patient, active/unique tests, bilingual search, totals, changed prices/deactivation, immutable failure, concurrent idempotent replay, unchanged snapshots, WALK_IN fixtures without slot creation and unavailable live transport.')
