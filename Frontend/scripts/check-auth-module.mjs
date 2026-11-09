import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { authApi } from '../src/auth/api.js'
import { patientApi, requestPatientOperation } from '../src/services/patientApi.js'
import { patientDestination, authenticatedPatientDestination } from '../src/auth/access.js'

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
  assert.equal(patientApi[method], operation, `Compatibility service changed: ${method}`)
  await assert.rejects(operation(), error => error.code === 'SERVICE_UNAVAILABLE')
}
const controller = new AbortController()
controller.abort()
await assert.rejects(authApi.getAccess({ signal: controller.signal }), error => error.name === 'AbortError')
await assert.rejects(requestPatientOperation('unsupported'), /Unknown patient operation/)
await assert.rejects(authenticatedPatientDestination(), error => error.code === 'SERVICE_UNAVAILABLE')
assert.equal(patientDestination({ authenticated: false }), '#/login')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: false }), '#/verify-email')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: true, hasLinkedMedicalFile: false }), '#/patient/file')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: true, hasLinkedMedicalFile: true }), '#/patient/dashboard')
console.log(`Authentication boundary passed: ${visited.size} local modules/styles, no patient implementations, unchanged account facade/errors/cancellation and verified role routing.`)
