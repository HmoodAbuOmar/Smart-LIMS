import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]) }
for (const file of files('dist').filter(file => /\.(js|css|html|map)$/.test(file))) {
  const content = readFileSync(file, 'utf8')
  for (const marker of ['/__receptionist', 'r01-appointment-', 'r01-patient-', 'todayDevelopmentService', 'DevelopmentReceptionist']) assert.ok(!content.includes(marker), `${marker} must not be in ${file}`)
}
console.log('PASS: receptionist preview route, writable development service and appointment/patient fixtures are absent from production assets.')
