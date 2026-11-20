import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]) }
for (const path of files('dist').filter(path => /\.(js|css|html|map)$/.test(path))) {
  const source = readFileSync(path, 'utf8')
  for (const marker of ['/__receptionist', 'patientsDevelopmentService', 'r02-patient-', 'demo-patient-1']) assert.ok(!source.includes(marker), `${path}: ${marker} must remain development-only`)
}
console.log('PASS: R02 development routes, fixtures and local patient creation service are absent from production assets.')
