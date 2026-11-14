import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]) }
for (const path of files('dist').filter(path => /\.(js|css|html|map)$/.test(path))) {
  const text = readFileSync(path, 'utf8')
  for (const marker of ['smart-lims.receptionist-orders.v1', 'smart-lims.receptionist-patients.v1', 'ro-orders', 'r05-order-']) assert.ok(!text.includes(marker), `${path}: development Orders data/workspace leaked`)
}
console.log('PASS: Orders workspace and development patient/order persistence are excluded from production assets.')
