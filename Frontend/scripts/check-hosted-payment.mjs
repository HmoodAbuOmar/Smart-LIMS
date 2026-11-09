import assert from 'node:assert/strict'
import { configureHostedPaymentProvider, mountHostedPaymentFields, paymentReference, processHostedPayment, validReceiptEmail } from '../src/services/hostedPayment.js'

assert.ok(validReceiptEmail(' receipt@example.test '))
for (const value of ['', 'invalid', 'patient@']) assert.ok(!validReceiptEmail(value))
assert.equal(paymentReference({ paymentReference: 'pm_authorized_reference' }), 'pm_authorized_reference')
for (const result of [null, { paid: true }, { paymentReference: '1234567890123456' }]) assert.throws(() => paymentReference(result))
assert.equal(await mountHostedPaymentFields({}), null, 'No provider means no editable card fields')
assert.throws(() => configureHostedPaymentProvider({}))

globalThis.window = { location: { origin: 'https://patient.example.test' } }
let destroyed = 0
const fields = { validate: async () => true, confirm: async () => ({ paymentReference: 'pm_reference' }), destroy: () => destroyed++ }
configureHostedPaymentProvider({ frameOrigins: ['https://processor.example.test'], mount: async () => fields })
const containers = Object.fromEntries(['cardholder', 'number', 'expiry', 'cvc'].map(key => [key, { querySelector: selector => selector === 'iframe' ? { src: 'https://processor.example.test/hosted-field' } : null }]))
const controller = new AbortController()
assert.equal(await mountHostedPaymentFields({ containers, signal: controller.signal }), fields)
await assert.rejects(mountHostedPaymentFields({ containers: { number: { querySelector: () => ({ src: 'https://patient.example.test/card' }) } }, signal: controller.signal }))
controller.abort()
assert.equal(await mountHostedPaymentFields({ containers, signal: controller.signal }), null)
assert.equal(destroyed, 2)
delete globalThis.window

const calls = [], payload = { requestId: 'request-id', tests: ['cbc'], date: '2030-01-01', time: '08:00', method: 'online' }
const serverResponse = { confirmed: false }
const api = {
  async createHostedPayment(request) { calls.push('session'); assert.equal(request.receiptEmail, 'receipt@example.test'); assert.deepEqual(request.tests, ['cbc']); return { id: 'session_identifier', amount: 25, currency: 'ILS' } },
  async verifyPaymentAndBooking(request) { calls.push('server-verification'); assert.equal(request.paymentReference, 'pm_reference'); assert.equal(request.paymentSessionId, 'session_identifier'); return serverResponse },
}
const args = { api, payload, expectedAmount: 25, receiptEmail: 'receipt@example.test', confirmCard: async session => { calls.push('processor-confirmation'); assert.equal(session.id, 'session_identifier'); return 'pm_reference' } }
assert.equal(await processHostedPayment(args), serverResponse, 'Never replace an unconfirmed server response with local success')
assert.deepEqual(calls, ['session', 'processor-confirmation', 'server-verification'])
calls.length = 0
await assert.rejects(processHostedPayment({ ...args, confirmCard: async () => { throw new Error('Declined') } }))
assert.deepEqual(calls, ['session'], 'No booking verification after failed processor confirmation')
calls.length = 0
await assert.rejects(processHostedPayment({ ...args, receiptEmail: 'invalid' }))
assert.deepEqual(calls, [], 'No session or payment attempt for invalid email')
await assert.rejects(processHostedPayment({ ...args, confirmCard: async () => '1234567890123456' }))
assert.deepEqual(calls, ['session'], 'Only opaque references reach the backend adapter')
calls.length = 0
await assert.rejects(processHostedPayment({ ...args, expectedAmount: 99 }))
assert.deepEqual(calls, ['session'], 'A mismatched quote cannot authorize the processor')
console.log('Hosted payment boundary checks passed: unavailable provider, cross-origin fields, cleanup, email validation, ordered session/processor/server steps, failed confirmation, opaque references and no fabricated success.')
