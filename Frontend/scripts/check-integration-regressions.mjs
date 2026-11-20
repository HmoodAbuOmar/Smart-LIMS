import assert from 'node:assert/strict'
import { apiTarget } from '../apiTarget.js'
import { authenticatedRequest, logoutWithCookie } from '../src/auth/cookieSession.js'
import { sessionSignal, subscribeSession } from '../src/auth/sessionState.js'
import { liveCatalog, livePatients, liveReports } from '../src/admin/adminLiveApi.js'
import { portalApi } from '../src/services/portalApi.js'
import { createSubmissionKeys, clearPendingSubmissions, submissionFingerprint } from '../src/services/submissionKeys.js'

for (const invalid of [undefined, '', 'https://user:pass@example.test', 'https://example.test/api', 'http://example.test', 'file:///tmp', 'https://example.test/?key=fixture']) {
  assert.equal(apiTarget(invalid), null)
}
assert.equal(apiTarget('http://127.0.0.1:18080'), 'http://127.0.0.1:18080')
assert.equal(apiTarget('https://example.test/'), 'https://example.test')

const values = new Map()
const storage = {
  get length() { return values.size },
  key: index => [...values.keys()][index],
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
}
const hash = await submissionFingerprint('fixture-owner', 'createOrder', ['fixture-test'])
const key = createSubmissionKeys(storage).get(hash)
assert.equal(createSubmissionKeys(storage).get(hash), key, 'Retry after remount keeps the key')
assert.notEqual(createSubmissionKeys(storage).get(await submissionFingerprint('other-owner', 'createOrder', ['fixture-test'])), key)
createSubmissionKeys(storage).complete(hash)
assert.notEqual(createSubmissionKeys(storage).get(hash), key)
clearPendingSubmissions(storage)
assert.equal(values.size, 0)

globalThis.window = new EventTarget()
globalThis.document = { cookie: '' }
const changes = []
const off = subscribeSession(reason => changes.push(reason))
const calls = []
let token = 0
let respond = () => { throw new Error('Unexpected fixture request') }
globalThis.fetch = async (path, options) => {
  calls.push([options.method, path])
  if (path === '/api/auth/csrf-token') {
    document.cookie = 'XSRF-TOKEN=fixture-' + ++token
    return Response.json({ message: 'CSRF issued' })
  }
  if (options.method !== 'GET') assert.equal(options.headers['X-XSRF-TOKEN'], 'fixture-' + token)
  return respond(path, options)
}
const ok = data => Response.json(data)
const denied = status => Response.json({ code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' }, { status })

// A failed read-back must remain a separate outcome from the confirmed write.
respond = (path, options) => {
  if (path === '/api/patients' && options.method === 'POST') return ok({ id: 'fixture-patient', patientNumber: 'P-1', fullName: 'Fixture patient' })
  if (path === '/api/patients/fixture-patient') return Response.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503 })
  throw Error('Unexpected fixture request')
}
const record = await livePatients.save({ nameEn: 'Fixture patient', phone: '0000000000' })
assert.equal(record.fileNumber, 'P-1')
assert.deepEqual(calls.map(([, path]) => path), ['/api/auth/csrf-token', '/api/patients'])
await assert.rejects(livePatients.refresh(record.id), { status: 503 })

const measurements = [
  { valueId: 'below', numericValue: 5, numericComparator: '<', chartValue: null, measuredAt: '2026-01-01' },
  { valueId: 'above', numericValue: 10, numericComparator: '>=', chartValue: 10, measuredAt: '2026-01-02' },
  { valueId: 'exact', numericValue: 6, chartValue: 6, measuredAt: '2026-01-03' },
]
respond = path => {
  assert.match(path, /\/api\/results\/me\/trends\?seriesId=fixture&period=ALL&page=1&size=20/)
  return ok({ series: { seriesId: 'fixture' }, chartData: measurements, measurements: { content: measurements, page: 1, totalPages: 2, last: true } })
}
const trend = await portalApi.healthTrend('fixture', 'ALL', 1)
assert.deepEqual(trend.measurements.map(row => row.displayValue), ['<5', '>=10', '6'])
assert.deepEqual(trend.points.map(row => row.id), ['exact'])
assert.equal(trend.pagination.page, 1)

calls.length = 0
const page = content => ({ content, last: true, totalPages: 1, totalElements: content.length })
respond = path => {
  if (path.startsWith('/api/lab-tests?')) return ok(page([{ id: 'test' }]))
  if (path.startsWith('/api/lab-tests/test/parameters?')) return ok(page([{ id: 'parameter', labTestId: 'test' }]))
  if (path.startsWith('/api/lab-tests/test/parameters/parameter/reference-ranges?')) return ok(page([{ id: 'range' }]))
  if (path.startsWith('/api/reports/operations?')) return ok({ ordersByStatus: [], testsByStatus: [], appointments: { scheduled: 0 }, sourceDetails: [{ metric: 'financial', source: 'Unavailable' }] })
  if (path === '/api/patients/me/dashboard') return ok({ recentOrders: [], latestResults: [], catalogSuggestions: [] })
  throw Error('Unexpected fixture request')
}
await portalApi.loadDashboard({ fileNumber: 'P-1' })
assert.deepEqual(calls.map(([, path]) => path), ['/api/patients/me/dashboard'])
calls.length = 0
await liveCatalog.load({ page: 2, size: 7, search: 'blood', active: false })
assert.deepEqual(calls.map(([, path]) => path), ['/api/lab-tests?page=2&size=7&search=blood&active=false'])
await liveCatalog.parameters('test')
assert.equal(calls.length, 2)
await liveCatalog.ranges('test', 'parameter')
assert.equal(calls.length, 3)
const report = await liveReports.load({ from: '2026-01-01', to: '2026-01-07' })
assert.equal(report.sourceDetails[0].source, 'Unavailable')

respond = path => path === '/api/forbidden' ? denied(403) : denied(401)
const originalScope = sessionSignal()
await assert.rejects(authenticatedRequest('/api/forbidden'), { status: 403 })
assert.equal(originalScope.aborted, false)
await assert.rejects(authenticatedRequest('/api/unauthorized'), { status: 401 })
assert.equal(originalScope.aborted, true)
assert.deepEqual(changes, ['signed-out'])

let resolveLate, startRequest
const started = new Promise(resolve => { startRequest = resolve })
respond = () => { startRequest(); return new Promise(resolve => { resolveLate = resolve }) }
const stale = authenticatedRequest('/api/late')
await started
const crossTabEvent = Object.assign(new Event('storage'), { key: 'smart-lims.session-event', newValue: '{"reason":"changed"}' })
window.dispatchEvent(crossTabEvent)
resolveLate(ok({ privateData: 'fixture' }))
await assert.rejects(stale, { name: 'AbortError' })
assert.equal(changes.at(-1), 'changed')

calls.length = 0
respond = path => path === '/api/auth/logout' ? ok({ success: true }) : denied(403)
await Promise.all([
  assert.rejects(authenticatedRequest('/api/write', { method: 'POST', body: {} }), { status: 403 }),
  logoutWithCookie(),
])
assert.deepEqual(calls.map(([, path]) => path), ['/api/auth/csrf-token', '/api/write', '/api/auth/csrf-token', '/api/auth/logout'])
off()
console.log('Integration fixtures passed: proxy target validation, confirmed-save/read-back split, comparator values, scoped reads, server pagination, provenance, CSRF ordering, no write replay, and stale-session cancellation.')
