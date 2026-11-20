import assert from 'node:assert/strict'
import { filterEvents, eventDay, text } from './auditLogModel.js'
import { createEvents } from './auditLogData.js'
import { loadAuditEvents } from './auditLogService.js'
import { auditLogCopy } from './auditLogCopy.js'
const events = createEvents()
const filters = { from: '', to: '', actor: '', action: '', query: '' }
const original = structuredClone(events)
assert.equal(new Set(events.map(event => event.id)).size, events.length)
assert.deepEqual(filterEvents([...events].reverse(), filters), events)
for (const query of ['CFG-1001', 'تعريف', 'catalog', 'Historical']) assert.ok(filterEvents(events, { ...filters, query }).length)
assert.ok(filterEvents(events, { ...filters, actor: 'actor-2', action: 'UPDATED' }).every(event => event.actorId === 'actor-2' && event.action === 'UPDATED'))
const day = eventDay(events[0].timestamp)
assert.ok(filterEvents(events, { ...filters, from: day, to: day }).every(event => eventDay(event.timestamp) === day))
assert.equal(filterEvents(events, { ...filters, from: '2099-01-01' }).length, 0)
assert.equal(filterEvents(events, { ...filters, query: 'no-match' }).length, 0)
assert.deepEqual(events, original)
await assert.rejects(loadAuditEvents(false), { code: 'AUDIT_UNAVAILABLE' })
for (const event of events) for (const language of ['en', 'ar']) {
  assert.ok(text(event, 'actor', language) && text(event, 'entity', language) && text(event, 'details', language))
  assert.ok(auditLogCopy[language][event.action] && auditLogCopy[language][event.role])
}
console.log('PASS: newest-first stable sorting, bilingual/ID/details search, combined filters, date bounds, immutable records, unique IDs, bilingual copy and production-unavailable service.')
