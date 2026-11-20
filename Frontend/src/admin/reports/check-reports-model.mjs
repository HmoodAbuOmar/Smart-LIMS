import assert from 'node:assert/strict'
import { buildReport, defaultPeriod, periodErrors } from './reportsModel.js'
import { loadReportSources } from './reportsService.js'
import { createOperationsData } from '../operationsPayments/operationsPaymentsService.js'
import { reportsCopy } from './reportsCopy.js'
const data = {
  orders: [
    { id: 'o1', createdAt: '2026-11-10T08:00:00Z', status: 'NEW', tests: [{ id: 't1' }, { id: 't2' }] },
    { id: 'o2', createdAt: '2026-11-09T08:00:00Z', status: 'COMPLETED', tests: [{ id: 't1' }] },
  ],
  transactions: [
    { id: 'p1', orderId: 'o2', type: 'PAYMENT', status: 'CONFIRMED', amountCents: 10000, recordedAt: '2026-11-09T08:00:00Z', confirmedAt: '2026-11-10T08:00:00Z' },
    { id: 'r1', orderId: 'o2', type: 'REFUND', status: 'CONFIRMED', amountCents: 2000, recordedAt: '2026-11-10T08:00:00Z' },
    ...['PENDING', 'FAILED', 'CANCELLED'].map((status, i) => ({ id: `x${i}`, type: 'PAYMENT', status, amountCents: 99999, recordedAt: '2026-11-10T08:00:00Z' })),
    { id: 'r2', type: 'REFUND', status: 'PENDING', amountCents: 40000, recordedAt: '2026-11-10T08:00:00Z' },
  ],
  appointments: ['BOOKED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW', 'CANCELLED'].map((status, i) => ({ id: `a${i}`, status, scheduledDate: '2026-11-10' })),
  samples: [{ id: 's1', status: 'rejected', date: '2026-11-10' }, { id: 's2', status: 'accepted', date: '2026-11-10' }],
}
const period = { from: '2026-11-10', to: '2026-11-10' }
const original = structuredClone(data)
const report = buildReport(data, period)
assert.equal(report.ordersByStatus.find(row => row.status === 'NEW').count, 1)
assert.equal(report.ordersByStatus.find(row => row.status === 'COMPLETED').count, 0)
assert.equal(report.testsByStatus.find(row => row.status === 'NEW').count, 2)
assert.deepEqual(report.attendance, { scheduled: 4, attended: 2, noShow: 1 })
assert.equal(report.rejected, 1)
assert.equal(report.financial.receiptsCents, 10000)
assert.equal(report.financial.refundsCents, 2000)
assert.equal(report.financial.netCents, 8000)
assert.deepEqual(data, original)
assert.equal(buildReport(data, { from: '2099-01-01', to: '2099-01-02' }).empty, true)
assert.throws(() => buildReport(data, { from: '', to: '' }))
assert.throws(() => buildReport(data, { from: '2026-11-11', to: '2026-11-10' }))
assert.ok(Object.keys(periodErrors({ from: '2026-02-30', to: '2026-03-01' })).length)
const missing = buildReport({ orders: [], transactions: [] }, period)
assert.equal(missing.attendance, null); assert.equal(missing.rejected, null)
const boundary = structuredClone(data)
boundary.transactions.push({ id: 'boundary', type: 'PAYMENT', status: 'CONFIRMED', amountCents: 500, recordedAt: '2026-11-09T22:30:00Z' })
assert.equal(buildReport(boundary, period).financial.receiptsCents, 10500)
const existing = buildReport({ ...createOperationsData('2026-11-10'), appointments: [], samples: [] }, defaultPeriod('2026-11-10'))
assert.ok(existing.financial.receiptsCents > 0 && existing.financial.refundsCents > 0)
assert.equal(existing.financial.netCents, existing.financial.receiptsCents - existing.financial.refundsCents)
await assert.rejects(loadReportSources(), { code: 'REPORTS_UNAVAILABLE' })
assert.deepEqual(Object.keys(reportsCopy.en).sort(), Object.keys(reportsCopy.ar).sort())
console.log('PASS: date bounds/timezone, parent-order test counts, attendance/cancellation, rejected samples, confirmation dates/fallback, gross/refunds/net, non-confirmed exclusions, empty/unavailable, validation, source immutability and translations.')
