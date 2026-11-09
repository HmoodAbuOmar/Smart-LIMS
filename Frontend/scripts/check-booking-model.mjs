import assert from 'node:assert/strict'
import { portalReducer, dateAtOffset, todayValue } from '../src/portal/portalModel.js'
import { bookingDraftError, selectedBookingTests } from '../src/portal/booking/bookingModel.js'
let date = dateAtOffset(3)
if (new Date(`${date}T12:00:00`).getDay() === 5) date = dateAtOffset(4)
const initial = { tests: [{ id: 'cbc', price: 25 }, { id: 'd', price: 20 }], cart: [], orders: [], appointments: [], notifications: [], profile: { name: 'Chosen Patient' } }
let state = initial
const update = action => { state = portalReducer(state, action) }
assert.equal(bookingDraftError(state), 'bookingTestsRequired')
update({ type: 'ADD', id: 'cbc' }); update({ type: 'ADD', id: 'cbc' }); update({ type: 'ADD', id: 'd' })
assert.deepEqual(state.cart, ['cbc', 'd'])
update({ type: 'CHECKOUT_EDIT', patch: { date, time: '10:00', type: 'collection', secret: 'never retained' } })
assert.ok(!('secret' in state.checkout))
assert.equal(bookingDraftError(state), null)
update({ type: 'CHECKOUT_REVIEW', requestId: 'attempt-1' })
assert.equal(state.orders.length, 0); assert.equal(state.appointments.length, 0)
update({ type: 'CHECKOUT_METHOD', method: 'online' }); update({ type: 'CHECKOUT_START' })
const processing = state
update({ type: 'ADD', id: 'missing' }); assert.equal(state, processing)
update({ type: 'CHECKOUT_COMPLETE', receipt: { requestId: 'attempt-1', method: 'online', source: 'unverified', outcome: 'approved' } }); assert.equal(state, processing)
update({ type: 'CHECKOUT_FAILED', requestId: 'attempt-1' })
assert.equal(state.checkout.stage, 'reviewed'); assert.equal(state.orders.length, 0)
update({ type: 'CHECKOUT_METHOD', method: 'laboratory' }); update({ type: 'CHECKOUT_START' })
const completion = { type: 'CHECKOUT_COMPLETE', receipt: { requestId: 'attempt-1', method: 'laboratory', source: 'development-simulator', outcome: 'approved' }, bookingId: 'SAMPLE-B1', orderId: 'SAMPLE-O1', notificationId: 'N1', date: todayValue(), timestamp: new Date().toISOString() }
update(completion)
assert.equal(state.orders.length, 1); assert.equal(state.appointments.length, 1)
assert.equal(state.orders[0].total, 45); assert.equal(state.appointments[0].total, 45)
assert.equal(state.appointments[0].patientName, 'Chosen Patient')
assert.equal(state.appointments[0].paymentStatus, 'pending')
assert.deepEqual(state.appointments[0].tests, ['cbc', 'd'])
assert.deepEqual(state.cart, [])
const completed = state; update(completion); assert.equal(state, completed, 'Duplicate completion is idempotent')
state = { ...initial, orders: completed.orders, checkout: { date, time: '11:00', type: 'collection', orderId: 'SAMPLE-O1', method: 'online', stage: 'editing' } }
assert.deepEqual(selectedBookingTests(state), ['cbc', 'd'])
update({ type: 'CHECKOUT_REVIEW', requestId: 'attempt-2' }); update({ type: 'CHECKOUT_METHOD', method: 'online' }); update({ type: 'CHECKOUT_START' })
update({ ...completion, receipt: { ...completion.receipt, requestId: 'attempt-2', method: 'online' }, bookingId: 'SAMPLE-B2' })
assert.equal(state.orders.length, 1, 'Related order reused without duplication')
assert.equal(state.appointments[0].paymentStatus, 'simulatedPaid')
assert.equal(state.orders[0].paymentStatus, 'simulatedPaid')
console.log('Booking state checks passed: selection/draft persistence, no premature records, failed/unverified payments, pending laboratory payment, simulated approval, atomic order/appointment association, and duplicate prevention.')
