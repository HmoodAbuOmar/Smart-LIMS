import assert from 'node:assert/strict'
import { portalReducer, validSlot, validateProfile, totalPrice, todayValue, dateAtOffset } from '../src/portal/portalModel.js'
import { portalResources } from '../src/portal/portalCopy.js'
const profile = { name: 'Sample Patient', dateOfBirth: '2000-02-29', gender: 'male', phone: '+970 599 123 456', email: 'patient@example.invalid', address: '' }
assert.deepEqual(validateProfile(profile), {})
for (const dateOfBirth of ['2001-02-29', '2999-01-01', '', '1899-01-01']) assert.equal(validateProfile({ ...profile, dateOfBirth }).dateOfBirth, 'invalidDate')
assert.equal(validateProfile({ ...profile, gender: 'other' }).gender, 'fieldRequired')
assert.equal(validateProfile({ ...profile, phone: 'call-me' }).phone, 'invalidPhone')
assert.equal(validateProfile({ ...profile, email: 'bad' }).email, 'invalidEmail')
const now = new Date('2026-10-26T07:00:00')
assert.equal(todayValue(now), '2026-10-26')
assert.equal(dateAtOffset(1, now), '2026-10-27')
assert.ok(validSlot('2026-10-27', '10:00', [], null, now))
assert.ok(!validSlot('2026-10-25', '10:00', [], null, now))
assert.ok(!validSlot('2026-10-30', '10:00', [], null, now), 'Friday unavailable')
assert.ok(!validSlot('2026-10-27', '03:00', [], null, now))
assert.ok(!validSlot('2026-11-31', '10:00', [], null, now), 'Invalid calendar date')
assert.ok(!validSlot('2027-12-31', '10:00', [], null, now), 'Booking horizon enforced')
const existing = [{ id: 'a', date: '2026-10-27', time: '10:00', status: 'confirmed' }]
assert.ok(!validSlot('2026-10-27', '10:00', existing, null, now))
assert.ok(validSlot('2026-10-27', '10:00', existing, 'a', now), 'Rescheduling can keep own slot')
let state = { tests: [{ id: 'cbc', price: 25 }, { id: 'd', price: 20 }], cart: [], orders: [], appointments: existing, profile, notifications: [{ id: 'n', read: false }] }
state = portalReducer(state, { type: 'ADD', id: 'cbc' }); state = portalReducer(state, { type: 'ADD', id: 'cbc' })
assert.deepEqual(state.cart, ['cbc'], 'No duplicate tests')
assert.equal(portalReducer(state, { type: 'ADD', id: 'missing' }), state)
state = portalReducer(state, { type: 'ADD', id: 'd' }); assert.equal(totalPrice(state.cart, state.tests), 45)
state = portalReducer(state, { type: 'ORDER', id: 'sample-order', date: '2026-10-26' }); assert.equal(state.orders[0].total, 45); assert.deepEqual(state.cart, [])
assert.equal(portalReducer(state, { type: 'ORDER', id: 'duplicate' }), state, 'Empty cart cannot create an order')
state = portalReducer(state, { type: 'CANCEL', id: 'a' }); assert.equal(state.appointments[0].status, 'cancelled')
state = portalReducer(state, { type: 'READ', id: 'all' }); assert.ok(state.notifications.every(n => n.read))
assert.deepEqual(Object.keys(portalResources.en), Object.keys(portalResources.ar))
for (const lang of ['ar', 'en']) for (const value of Object.values(portalResources[lang])) assert.ok(typeof value === 'string' && value.length)
console.log(`Portal model checks passed: validation, calendar, booking constraints, cart/order state, cancellation, notification state, and ${Object.keys(portalResources.en).length} translation pairs.`)
