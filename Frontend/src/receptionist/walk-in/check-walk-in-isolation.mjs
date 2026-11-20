import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]) }
for (const path of files('dist').filter(path => /\.(js|css|html|map)$/.test(path))) {
  const source = readFileSync(path, 'utf8')
  for (const marker of ['/__receptionist', 'walkInDevelopmentService', 'r05-order-', 'r05-walk-in']) assert.ok(!source.includes(marker), `${path}: ${marker} must remain development-only`)
}
console.log('PASS: R05 interface, development routes and local order service are excluded from production assets.')
