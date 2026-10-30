import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { emptyPatientWorkspace, patientFacingWorkspace, verifiedBookingResponse } from '../src/portal/patientState.js'
import { portalReducer, dateAtOffset, todayValue } from '../src/portal/portalModel.js'
import { portalResources } from '../src/portal/portalCopy.js'

const forbidden = /development|preview|demo\b|mock\b|simulat|illustrative|تطويري|نموذجي|تجريبي|معاينة|محاكاة/i
for (const dictionary of Object.values(portalResources)) for (const [key, value] of Object.entries(dictionary)) assert.ok(!forbidden.test(value), `${key}: patient-facing copy`)
assert.equal(portalResources.ar.bookingSuccess, "تم تأكيد حجزك بنجاح!")
const empty = emptyPatientWorkspace()
const cleaned = patientFacingWorkspace({ ...empty, profile: { ...empty.profile, fileNumber: 'SAMPLE-P001', name: 'Sample Patient' }, orders: [{ id: 'SAMPLE-1' }], appointments: [{ id: 'A', source: 'development' }], results: [{ id: 'R', source: 'development' }] })
assert.equal(cleaned.profile.name, ''); assert.equal(cleaned.orders.length + cleaned.appointments.length + cleaned.results.length, 0)
let date = dateAtOffset(3); if (new Date(`${date}T12:00:00`).getDay() === 5) date = dateAtOffset(4)
const tests = [{ id: 'a', name: ['Selected Test A', 'الفحص المختار أ'], price: 25 }, { id: 'b', name: ['Selected Test B', 'الفحص المختار ب'], price: 20 }]
const profile = { ...empty.profile, name: 'Chosen Patient', fileNumber: 'P100' }
const draft = { date, time: '10:00', type: 'collection', method: 'laboratory', stage: 'processing', requestId: 'request-1', tests: ['a', 'b'] }
const initial = { ...empty, profile, tests, cart: ['a', 'b'], checkout: draft }
const pending = portalReducer(initial, { type: 'CHECKOUT_PENDING', requestId: 'request-1' })
assert.equal(pending.checkout.stage, 'pending'); assert.equal(pending.appointments.length, 0); assert.equal(pending.orders.length, 0); assert.deepEqual(pending.cart, ['a', 'b'])
assert.equal(portalReducer(pending, { type: 'CHECKOUT_RETRY' }).checkout.stage, 'reviewed')
const response = { confirmed: true, requestId: 'request-1', currency: 'ILS', appointment: { id: 'B100', patientId: 'P100', patientName: profile.name, orderId: 'O100', tests: ['a', 'b'], date, time: '10:00', paymentMethod: 'laboratory', paymentStatus: 'pending', total: 45, status: 'confirmed' }, order: { id: 'O100', patientId: 'P100', tests: ['a', 'b'], total: 45, date: todayValue(), status: 'pending', stage: 0 } }
assert.equal(verifiedBookingResponse({ ...response, confirmed: false }, draft, profile), null)
assert.equal(verifiedBookingResponse({ ...response, requestId: 'another' }, draft, profile), null)
assert.equal(verifiedBookingResponse(response, draft, { fileNumber: 'OTHER' }), null)
assert.equal(verifiedBookingResponse({ ...response, appointment: { ...response.appointment, source: 'development' } }, draft, profile), null)
const online = { ...response, appointment: { ...response.appointment, paymentMethod: 'online', paymentStatus: 'paid' } }
assert.equal(verifiedBookingResponse(online, { ...draft, method: 'online' }, profile), null, 'A payment label alone cannot prove payment')
assert.ok(verifiedBookingResponse({ ...online, paymentVerified: true }, { ...draft, method: 'online' }, profile))
const verified = verifiedBookingResponse(response, draft, profile)
const confirmed = portalReducer(initial, { type: 'CHECKOUT_SERVER_COMPLETE', requestId: 'request-1', ...verified })
assert.equal(confirmed.appointments.length, 1); assert.equal(confirmed.orders[0].id, 'O100')
assert.equal(portalReducer(confirmed, { type: 'CHECKOUT_SERVER_COMPLETE', requestId: 'request-1', ...verified }), confirmed)

const storage = new Map()
globalThis.window = { location: { hash: '#home', search: '' }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }
globalThis.document = { documentElement: {}, title: '', querySelector: () => ({ setAttribute() {} }) }
const server = await createServer({ define: { 'import.meta.env.DEV': 'false' }, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: i18n } = await server.ssrLoadModule('/src/i18n.js')
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const { default: PatientPortal } = await server.ssrLoadModule('/src/portal/PatientPortal.jsx')
  const { BookingReceipt } = await server.ssrLoadModule('/src/portal/BookingFlow.jsx')
  const ui = { Title: ({ title }) => createElement('h1', null, i18n.t(title, { ns: 'portal' })), Button: ({ children }) => createElement('button', null, children), Empty: ({ title }) => createElement('p', null, i18n.t(title, { ns: 'portal' })) }
  for (const language of ['ar', 'en']) {
    await i18n.changeLanguage(language)
    const t = (key, values) => i18n.t(key, { ns: 'portal', ...values })
    for (const route of ['#home', '#/signup', '#/login', '#/verify-email']) {
      window.location.hash = route
      const html = renderToStaticMarkup(createElement(App))
      assert.ok(!forbidden.test(html.replace(/<[^>]*>/g, ' ')))
      assert.ok(!/EX-P00|EX-S00|EX-R00|Ahmad Khaled|Sara Mahmoud/.test(html), 'No fictional records in marketing')
    }
    for (const route of ['dashboard', 'tests', 'orders', 'appointments', 'results', 'history', 'history?view=trends', 'notifications', 'profile', 'book', 'payment']) {
      const html = renderToStaticMarkup(createElement(PatientPortal, { initialData: cleaned, route, onNavigate() {}, onExit() {} }))
      assert.ok(!forbidden.test(html.replace(/<[^>]*>/g, ' ')), route)
      assert.ok(!html.includes('Sample Patient') && !html.includes('SAMPLE-P001'), 'No unlabeled fixture patient')
    }
    const api = { state: pending, t, navigate() {}, dispatch() {}, local: value => value[language === 'ar' ? 1 : 0], date: value => value, money: value => `${value.toFixed(2)} ₪` }
    const awaiting = renderToStaticMarkup(createElement(BookingReceipt, { api, ui, id: 'pending' }))
    assert.ok(awaiting.includes(t('bookingAwaiting')) && !awaiting.includes(t('bookingSuccess')))
    assert.ok(awaiting.includes(date) && awaiting.includes('10:00') && awaiting.includes('45.00'))
    assert.ok(!awaiting.includes('lucide-circle-check') && !awaiting.includes('B100'))
    assert.ok(!forbidden.test(awaiting.replace(/<[^>]*>/g, ' ')))
    const completed = renderToStaticMarkup(createElement(BookingReceipt, { api: { ...api, state: confirmed }, ui, id: 'B100' }))
    assert.ok(completed.includes(t('bookingSuccess')) && completed.includes('B100') && completed.includes('Chosen Patient'))
    assert.ok(completed.includes(api.local(tests[0].name)) && completed.includes(api.local(tests[1].name)))
    assert.ok(completed.includes(t('awaitingPayment')) && completed.includes(t('laboratory')) && completed.includes('lucide-circle-check'))
    const onlineReceipt = verifiedBookingResponse({ ...online, paymentVerified: true }, { ...draft, method: 'online' }, profile)
    const onlineState = portalReducer({ ...initial, checkout: { ...draft, method: 'online' } }, { type: 'CHECKOUT_SERVER_COMPLETE', requestId: draft.requestId, ...onlineReceipt })
    const paid = renderToStaticMarkup(createElement(BookingReceipt, { api: { ...api, state: onlineState }, ui, id: 'B100' }))
    assert.ok(paid.includes(t('paid')) && paid.includes(t('onlinePaid')) && paid.includes('Visa'))
    const cancelled = renderToStaticMarkup(createElement(BookingReceipt, { api: { ...api, state: { ...confirmed, appointments: confirmed.appointments.map(record => ({ ...record, status: 'cancelled' })) } }, ui, id: 'B100' }))
    assert.ok(!cancelled.includes(t('bookingSuccess')), 'Cancelled records cannot render a new booking success')
  }
  console.log('Patient-facing checks passed: professional EN/AR copy, empty/unavailable states, isolated fixtures, no premature bookings/payments, verified success template, selected details, and no duplicate server-confirmed records.')
} finally { await server.close() }
