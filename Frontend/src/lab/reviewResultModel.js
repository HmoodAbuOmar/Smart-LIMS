import { referenceLabel, versionMark } from './draftResultModel.js'
import { rejectionVersion } from './sampleListModel.js'

const COMPARATORS = new Set(['<', '<=', '>', '>='])
const FLAGS = new Set(['NORMAL', 'HIGH', 'LOW', 'ABNORMAL', 'NOT_EVALUATED'])
const STATUSES = new Set(['DRAFT', 'APPROVED', 'PUBLISHED'])
const AUTHOR_EVENTS = new Set(['CREATE', 'EDIT', 'CORRECTION'])

// Laboratory approval is an authorized administrator reviewer, identified by
// the server allowlist. The account payload does not carry that grant, so a
// technician — and an admin without an explicit grant — is not a reviewer.
export function reviewAudience(viewer) {
  if (viewer?.role === 'admin' && viewer.authorizedReviewer === true) return 'reviewer'
  return 'technician'
}

function authorship(result, userId) {
  const id = String(userId || '')
  if (!id || !Array.isArray(result?.events)) return 'unknown'
  const authored = result.events.some(event => AUTHOR_EVENTS.has(event?.kind) && String(event?.actor?.id || '') === id)
  return authored ? 'author' : 'other'
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function valueEntered(row) {
  if (row?.numericValue != null && row.numericValue !== '') return true
  return present(row?.textValue)
}

export function approvedReviewHash(resultId, preview = false) {
  const id = String(resultId || '').trim()
  if (!id || id.includes('/')) return ''
  return `${preview ? '/__lab' : '/lab-technician'}/approved/${encodeURIComponent(id)}`
}

export function approvedListRows(items) {
  return (items || [])
    .filter(item => item?.workingState === 'APPROVED' && item.workingResultId)
    .map(item => ({
      orderItemId: String(item.orderItemId || ''),
      resultId: String(item.workingResultId),
      testName: item.testName || '',
      patientName: item.patientName || '',
      patientNumber: item.patientNumber || '',
      orderNumber: item.orderNumber || '',
    }))
    .sort((left, right) => left.orderNumber.localeCompare(right.orderNumber) || left.testName.localeCompare(right.testName) || left.resultId.localeCompare(right.resultId))
}

export function filterResultRows(rows, search = '') {
  const query = String(search || '').trim().toLowerCase()
  if (!query) return rows
  return rows.filter(row => [row.testName, row.patientName, row.patientNumber, row.orderNumber].some(value => String(value || '').toLowerCase().includes(query)))
}

function requiredValuesEntered(values) {
  const rows = values || []
  if (!rows.length) return false
  return rows.every(row => row?.required !== true || valueEntered(row))
}

function eligibleSampleSelected(specimens) {
  return (specimens || []).some(sample => sample?.status === 'RECEIVED' && (sample.attestedAt || sample.attestedBy))
}

function measurementRecorded(measuredAt) {
  if (!measuredAt) return false
  const time = new Date(measuredAt).getTime()
  return Number.isFinite(time) && time <= Date.now()
}

function recordDetailsAvailable(result) {
  return present(result?.patient?.name) && present(result?.patient?.number) && present(result?.orderNumber) && present(result?.testName)
}

export function sampleReference(specimens) {
  return (specimens || []).map(sample => {
    const barcode = String(sample?.barcode || '').trim()
    return barcode || String(sample?.id || '').trim()
  }).filter(Boolean).join(', ')
}

export function reviewValueText(value) {
  if (present(value?.textValue) && (value?.numericValue == null || value.numericValue === '')) return value.textValue.trim()
  if (value?.numericValue == null || value.numericValue === '') return ''
  const number = String(value.numericValue)
  const comparator = COMPARATORS.has(value?.numericComparator) ? value.numericComparator : ''
  return comparator ? `${comparator} ${number}` : number
}

export function reviewView(result, viewer = null) {
  const rows = [...(result?.values || [])]
    .sort((left, right) => (left?.displayOrder - right?.displayOrder) || String(left?.code || '').localeCompare(String(right?.code || '')) || String(left?.parameterId || '').localeCompare(String(right?.parameterId || '')))
    .map(value => ({
      parameterId: String(value?.parameterId || ''),
      name: value?.name || '',
      valueText: reviewValueText(value),
      unit: value?.unit || '',
      reference: referenceLabel(value),
      flag: FLAGS.has(value?.flag) ? value.flag : '',
      notes: value?.notes || '',
    }))
  const checks = {
    values: requiredValuesEntered(result?.values),
    sample: eligibleSampleSelected(result?.specimens),
    measured: measurementRecorded(result?.measuredAt),
    record: recordDetailsAvailable(result),
  }
  const ready = checks.values && checks.sample && checks.measured && checks.record
  const status = STATUSES.has(result?.status) ? result.status : ''
  const version = rejectionVersion(result?.version)
  const reviewer = reviewAudience(viewer) === 'reviewer'
  // A reviewer who authored or edited this version cannot approve it. The
  // approver may publish. Unknown authorship hides approval rather than guessing.
  const author = authorship(result, viewer?.userId)
  const eligible = reviewer && ready && version != null
  return {
    id: String(result?.id || ''),
    status,
    version,
    versionLabel: versionMark(result?.versionNumber),
    testName: result?.testName || '',
    patientName: result?.patient?.name || '',
    patientNumber: result?.patient?.number || '',
    orderNumber: result?.orderNumber || '',
    sampleReference: sampleReference(result?.specimens),
    checks,
    rows,
    actions: {
      approve: eligible && status === 'DRAFT' && author === 'other',
      publish: eligible && status === 'APPROVED',
      edit: !reviewer && (status === 'DRAFT' || status === 'APPROVED'),
      preview: status === 'APPROVED' || status === 'PUBLISHED',
    },
  }
}
