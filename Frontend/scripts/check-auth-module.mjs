import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { authApi } from '../src/auth/api.js'
import { patientApi } from '../src/services/patientApi.js'
import { accountDestination, actionErrorKey, patientDestination } from '../src/auth/access.js'

const visited = new Set()
function inspect(file) {
  const full = path.resolve(file)
  if (visited.has(full)) return
  visited.add(full)
  assert.ok(!/[\\/](portal|dev)[\\/]|PatientOnboarding|PatientFileState/.test(full), `Account module imports a patient implementation: ${full}`)
  const source = fs.readFileSync(full, 'utf8')
  for (const match of source.matchAll(/(?:\bimport\s+(?:[^'"\r\n]*?\s+from\s+)?|\bexport\s+[^'"\r\n]*?\s+from\s+)['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) inspect(path.resolve(path.dirname(full), match[1]))
  }
}
inspect('src/auth/index.js')
assert.ok(visited.size > 12)
assert.ok(!('createFile' in authApi) && !('linkFile' in authApi))
for (const [method, operation] of Object.entries(authApi)) {
  if (['resendVerification', 'verificationStatus'].includes(method)) await assert.rejects(operation(), error => error.code === 'SERVICE_UNAVAILABLE')
}
const controller = new AbortController()
controller.abort()
await assert.rejects(authApi.getAccess({ signal: controller.signal }), error => error.name === 'AbortError')
assert.deepEqual(Object.keys(patientApi).sort(), ['createFile', 'linkFile'])
assert.equal(patientDestination({ authenticated: false }), '#/login')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: false }), '#/verify-email')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: true, hasLinkedMedicalFile: false }), '#/patient/file')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: true, hasLinkedMedicalFile: true }), '#/patient/dashboard')
for (const [role, destination] of [['admin', '#/admin'], ['receptionist', '#/receptionist/today'], ['lab_technician', '#/lab-technician']]) {
  assert.equal(accountDestination({ authenticated: true, role }), destination)
}
assert.equal(accountDestination({ authenticated: true, role: 'unknown' }), null)
assert.equal(actionErrorKey('EMAIL_NOT_CONFIRMED'), 'errors.emailNotVerified')
assert.equal(actionErrorKey('ACCOUNT_BLOCKED'), 'errors.accountBlocked')
assert.equal(actionErrorKey('ACCOUNT_LOCKED'), 'errors.rateLimited')

// In-process contract fixture. Never contacts a server or uses real credentials.
const password = crypto.randomUUID()
const initialCsrf = crypto.randomUUID()
const writeCsrf = crypto.randomUUID()
const { authenticatedRequest } = await import('../src/auth/cookieSession.js')
const logoutCsrf = crypto.randomUUID()
const cookie = token => `XSRF-TOKEN=${token}`
const user = { id: crypto.randomUUID(), role: 'PATIENT', emailConfirmed: true }
const steps = [
  ['GET', '/api/auth/csrf-token', () => {
    document.cookie = cookie(initialCsrf)
    return Response.json({ message: 'CSRF issued' })
  }],
  ['POST', '/api/auth/cookie-login', options => {
    assert.ok(options.headers['X-XSRF-TOKEN'] === initialCsrf)
    const body = JSON.parse(options.body)
    assert.deepEqual(Object.keys(body).sort(), ['emailOrUserName', 'password'])
    assert.equal(body.emailOrUserName, 'contract-fixture')
    assert.ok(body.password === password)
    return Response.json({ success: true, user })
  }],
  ['GET', '/api/auth/me', () => {
    document.cookie = ''
    return Response.json(user)
  }],
  ['GET', '/api/patients/me', () => Response.json({ code: 'PATIENT_PROFILE_NOT_LINKED' }, { status: 404 })],
  ['GET', '/api/auth/csrf-token', () => {
    document.cookie = cookie(writeCsrf)
    return Response.json({ message: 'CSRF issued before write' })
  }],
  ['POST', '/api/patients', options => {
    assert.ok(options.headers['X-XSRF-TOKEN'] === writeCsrf)
    return Response.json({ code: 'FORBIDDEN' }, { status: 403 })
  }],
  ['GET', '/api/auth/csrf-token', () => {
    document.cookie = cookie(logoutCsrf)
    return Response.json({ message: 'CSRF reissued for logout' })
  }],
  ['POST', '/api/auth/logout', options => {
    assert.ok(options.headers['X-XSRF-TOKEN'] === logoutCsrf)
    assert.equal(options.body, undefined)
    return Response.json({ success: true })
  }],
  ['GET', '/api/auth/me', () => Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })],
]
const originalFetch = globalThis.fetch
globalThis.document = { cookie: '' }
globalThis.fetch = async (url, options) => {
  assert.ok(steps.length, 'Unexpected auth request')
  const [method, endpoint, response] = steps.shift()
  assert.equal(url, endpoint)
  assert.equal(options.method, method)
  assert.equal(options.credentials, 'same-origin')
  assert.equal(options.headers.Authorization, undefined)
  return response(options)
}
try {
  await authApi.login({ email: 'contract-fixture', password })
  assert.equal(accountDestination(await authApi.getAccess()), '#/patient/file')
  await assert.rejects(authenticatedRequest('/api/patients', { method: 'POST', body: {} }), { code: 'FORBIDDEN' })
  await authApi.logout()
  assert.equal(document.cookie, 'XSRF-TOKEN=; Max-Age=0; Path=/')
  assert.equal(accountDestination(await authApi.getAccess()), '#/login')
  assert.equal(steps.length, 0)
} finally {
  globalThis.fetch = originalFetch
  delete globalThis.document
}
console.log(`Authentication boundary passed: ${visited.size} local modules/styles, account facade and cancellation, and server-role destinations.`)
console.log('Cookie request contract passed against an in-process fixture, including CSRF reissue, no write retry, and signed-out access.')
