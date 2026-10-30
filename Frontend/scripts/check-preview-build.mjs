import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? files(target) : [target]
  })
}
assert.ok(fs.existsSync('dist/index.html'), 'Run the production build first')
const markers = ['/onboarding/', 'SMARTLIMS_DEV_PREVIEW_ONLY', '/__preview/', '/__walkthrough/', '/__portal/', 'dev-preview-menu', 'dev-walkthrough-indicator', 'data-walkthrough-step', 'preview.patient@example.invalid', 'SAMPLE-001', 'SAMPLE-P001', 'SAMPLE-R1', 'patient@example.invalid', 'Development simulator is disabled', 'Invalid simulation request', 'SAMPLE-HISTORY', 'History fixtures are development only']
for (const file of files('dist').filter(file => /\.(html|js|css|map)$/.test(file))) {
  const source = fs.readFileSync(file, 'utf8')
  for (const marker of markers) assert.ok(!source.includes(marker), `${file}: development fixture ${marker} is absent`)
  assert.ok(!path.basename(file).includes('PatientPreview'), 'No development preview chunk')
}
console.log('Production isolation passed: preview routes, navigator, CSS, sample data and development module are absent from built assets.')
