import assert from 'node:assert/strict'
import { createTodayData, createTodayService } from '../today/todayDevelopmentService.js'
import { createWalkInService } from '../walk-in/walkInDevelopmentService.js'
import { createReceptionistPatientsService } from '../patients/patientsDevelopmentService.js'
import { createCatalogData } from '../../admin/catalog/adminCatalogService.js'
import { occupancy, canArrive, canCancel, canMove, displayStatus, bookableOrder } from './appointmentsModel.js'
import { appointmentsCopy } from './appointmentsCopy.js'
import { appointmentsApi } from './appointmentsService.js'

const now = () => new Date('2026-11-14T06:00:00Z'), date = '2026-11-15'
const shared = createTodayService({ now, delay: 0 }), patients = createReceptionistPatientsService({ delay: 0 })
const patient = (await patients.list()).content[0], catalog = { load: async () => createCatalogData() }
const orderService = createWalkInService({ patients, catalog, delay: 0, cascadeCancellation: (...args) => shared.cancelForOrder(...args) })
const test = (await orderService.listTests())[0]
async function orderFor(patientId = patient.id) { return orderService.create({ patientId, testIds: [test.id], quotedTests: [test], source: 'WALK_IN', notes: '', idempotencyKey: crypto.randomUUID() }) }
const order = await orderFor(), slots = await shared.slots(date), one = slots.find(slot => slot.capacity === 1), target = slots.find(slot => slot.capacity === 2)
assert.equal(bookableOrder(order, []), true)
assert.equal(bookableOrder({ ...order, status: 'CANCELLED' }, []), false)
assert.equal(bookableOrder({ ...order, items: undefined }, []), false)
for (const status of ['BOOKED', 'CONFIRMED', 'CHECKED_IN']) assert.equal(bookableOrder(order, [{ orderId: order.id, status }]), false)
assert.equal(bookableOrder(order, [{ orderId: order.id, status: 'CANCELLED' }]), true)
const booking = { order, patient, slotId: one.id, typeId: 'r07-collection', idempotencyKey: crypto.randomUUID() }
const saved = await shared.book(booking)
assert.equal(saved.status, 'BOOKED'); assert.equal(saved.orderId, order.id)
assert.equal((await shared.book(booking)).id, saved.id)
assert.equal((await shared.slots(date)).find(slot => slot.id === one.id).remainingCapacity, 0)
await assert.rejects(shared.book({ ...booking, idempotencyKey: crypto.randomUUID() }), { code: 'ORDER_NOT_BOOKABLE' })
assert.ok(canMove(saved, now())); assert.ok(canCancel(saved, now())); assert.equal(canArrive(saved, now()), false)
const originalTimes = [one.startsAt, one.endsAt]
const moved = await shared.reschedule(saved.id, target.id, 0)
assert.equal(moved.slotId, target.id); assert.equal(moved.version, 1)
assert.deepEqual([(await shared.slots(date)).find(slot => slot.id === one.id).startsAt, (await shared.slots(date)).find(slot => slot.id === one.id).endsAt], originalTimes)
await assert.rejects(shared.reschedule(saved.id, one.id, 0), { code: 'APPOINTMENT_CHANGED' })
await assert.rejects(shared.cancel(saved.id, '  ', 1), { code: 'REASON_REQUIRED' })
await shared.cancel(saved.id, 'Patient requested a different day', 1)
assert.equal((await orderService.getOrder(order.id)).status, 'PENDING')
const second = await orderFor(), booked = await shared.book({ ...booking, order: second, idempotencyKey: crypto.randomUUID() })
await orderService.cancelOrder(second.id, 'Order no longer needed')
assert.equal((await orderService.getOrder(second.id)).status, 'CANCELLED')
assert.equal((await shared.load()).find(record => record.id === booked.id).status, 'CANCELLED')
assert.equal((await shared.slots(date)).find(slot => slot.id === one.id).remainingCapacity, 1)
await assert.rejects(shared.book({ ...booking, order: second, idempotencyKey: crypto.randomUUID() }), { code: 'ORDER_NOT_BOOKABLE' }) // A stale pre-cancel order snapshot cannot book.
const initial = createTodayData(now()), checked = await shared.checkIn(initial[0].id, 0)
assert.equal((await shared.day('2026-11-14')).find(record => record.id === checked.id).status, 'CHECKED_IN')
assert.equal(occupancy('a', [{ slotId: 'a', status: 'BOOKED' }, { slotId: 'a', status: 'CHECKED_IN' }, { slotId: 'a', status: 'CANCELLED' }]), 2)
assert.equal(displayStatus('CONFIRMED'), 'BOOKED')

// Two confirmations race for the last space; only one can commit.
let release
const gate = new Promise(resolve => { release = resolve })
const racing = createTodayService({ initial: [], now, delay: 0, beforeWrite: action => action === 'book' ? gate : undefined })
const raceSlot = (await racing.slots(date)).find(slot => slot.capacity === 1)
const a = racing.book({ ...booking, slotId: raceSlot.id, order: { ...order, id: 'order-a' }, patient: { ...patient, id: 'patient-a' }, idempotencyKey: crypto.randomUUID() })
const b = racing.book({ ...booking, slotId: raceSlot.id, order: { ...order, id: 'order-b' }, patient: { ...patient, id: 'patient-b' }, idempotencyKey: crypto.randomUUID() })
release()
const results = await Promise.allSettled([a, b])
assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
assert.equal(results.find(result => result.status === 'rejected').reason.code, 'SLOT_FULL')
assert.equal((await racing.day(date))[0].booked, 1)
const immutable = createTodayService({ now, delay: 0, beforeWrite: async () => { throw new Error('offline') } })
await assert.rejects(immutable.checkIn(initial[0].id, 0)); assert.deepEqual(await immutable.load(), initial)
assert.deepEqual(Object.keys(appointmentsCopy.en).sort(), Object.keys(appointmentsCopy.ar).sort())
await assert.rejects(appointmentsApi.cancel('id', 'reason'), { code: 'SERVICE_UNAVAILABLE' })
console.log('PASS: shared Today check-in, capacity including arrivals, idempotent booking, last-space race, move/version rules without slot edits, cancellation reason/order preservation, order-cancel cascade, immutable failed writes, backend status mapping and bilingual copy.')
