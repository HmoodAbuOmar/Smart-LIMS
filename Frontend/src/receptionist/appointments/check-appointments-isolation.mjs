import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])
for (const path of files('dist').filter(path => /\.(js|css|html|map)$/.test(path))) {
  const text = readFileSync(path, 'utf8')
  for (const marker of ['smart-lims.receptionist-appointments.v1', 'r07-slot-', 'r07-appointment-', 'ra-page']) assert.ok(!text.includes(marker), `${path}: development R07 workspace leaked`)
}
console.log('PASS: R07 workspace, fixture slots and shared local appointment store are excluded from production assets.')
