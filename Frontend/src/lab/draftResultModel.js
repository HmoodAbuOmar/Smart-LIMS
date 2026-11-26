import { formatCollectionTime, parseCollectionTime } from './collectSampleModel.js'
import { rejectionVersion } from './sampleListModel.js'

const COMPARATORS = new Set(['<', '<=', '>', '>='])
const FLAGS = new Set(['NORMAL', 'HIGH', 'LOW', 'ABNORMAL', 'NOT_EVALUATED'])
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/

function western(value) {
  return String(value ?? '').trim().replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
}

function enteredNumber(value) {
  const text = western(value)
  if (!text) return null
  if (!/^-?(?:0|[1-9]\d{0,25})(?:\.\d{1,12})?$/.test(text)) return Number.NaN
  const number = Number(text)
  return Number.isFinite(number) ? number : Number.NaN
}

function storedDecimal(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  const text = western(value)
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number.NaN
  const number = Number(text)
  return Number.isFinite(number) ? number : Number.NaN
}

function cleanText(value, max) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (text.length > max || CONTROL.test(text)) return Number.NaN
  return text
}

export function draftEditorHash(resultId, preview = false) {
  const id = String(resultId || '').trim()
  if (!id || id.includes('/')) return ''
  return `${preview ? '/__lab' : '/lab-technician'}/drafts/${encodeURIComponent(id)}`
}

// Saving for review only stores the draft. Approval remains
// POST /api/results/{id}/approve and does not happen on this save.
export function draftReviewHash(resultId, preview = false) {
  const id = String(resultId || '').trim()
  if (!id || id.includes('/')) return ''
  return `${preview ? '/__lab' : '/lab-technician'}/drafts/${encodeURIComponent(id)}/review`
}

export function referenceLabel(value) {
  if (!value || value.referenceText == null) {
    return [value?.referenceMin, value?.referenceMax].filter(bound => bound != null && bound !== '').join(' – ')
  }
  return String(value.referenceText)
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right)
}

function attestedTo(sample, itemId) {
  const links = [...(sample?.attestations || []), ...(sample?.tests || [])]
  return links.some(link => sameId(link?.orderItemId, itemId))
}

export function eligibleReceivedSamples(samples, visits, orderItemId) {
  const itemId = String(orderItemId || '')
  const visitIds = new Set((visits || [])
    .filter(visit => (visit?.tests || []).some(test => sameId(test?.orderItemId, itemId)))
    .map(visit => String(visit?.id || ''))
    .filter(Boolean))
  const rows = []
  const seen = new Set()
  for (const sample of samples || []) {
    const id = String(sample?.id || '')
    const onVisit = visitIds.has(String(sample.visitId || ''))
    if (!id || seen.has(id) || sample.status !== 'RECEIVED' || (!onVisit && !attestedTo(sample, itemId))) continue
    seen.add(id)
    rows.push({ id, barcode: sample.barcode || '', sampleType: sample.sampleType || '' })
  }
  rows.sort((left, right) => left.barcode.localeCompare(right.barcode) || left.id.localeCompare(right.id))
  return rows
}

export function receivedLinkedSample(row, samples) {
  return (samples || []).some(sample => sameId(sample?.orderId, row?.orderId) && sample?.status === 'RECEIVED' && attestedTo(sample, row?.orderItemId))
}

// Open an existing draft by its result id. A linked received sample on an
// in-progress order with no working or published result can start one.
export function draftOpenDecision(row, samples) {
  if (!row?.orderItemId) return { action: 'blocked', reason: 'missing' }
  if (row.workingState === 'DRAFT' && row.workingResultId) return { action: 'open', resultId: String(row.workingResultId) }
  if (row.workingState === 'APPROVED') return { action: 'blocked', reason: 'approved' }
  if (row.currentResultId) return { action: 'blocked', reason: 'published' }
  if (row.orderStatus && row.orderStatus !== 'IN_PROGRESS') return { action: 'blocked', reason: 'state' }
  if (!receivedLinkedSample(row, samples)) return { action: 'blocked', reason: 'unlinked' }
  return { action: 'create', orderItemId: String(row.orderItemId) }
}

export const OPEN_DRAFT_COPY = {
  approved: 'openTestApproved',
  published: 'openTestPublished',
  state: 'openTestState',
  unlinked: 'openTestUnlinked',
  missing: 'openTestMissing',
  RESULT_STATE_CONFLICT: 'openTestState',
  RESULT_DEFINITIONS_UNAVAILABLE: 'openTestDefinitions',
  RESULT_WORKING_VERSION_EXISTS: 'openTestError',
  IDEMPOTENCY_KEY_REUSED: 'openTestError',
  unconfirmed: 'openTestUnconfirmed',
}

export function draftListRows(items) {
  return (items || [])
    .filter(item => item?.workingState === 'DRAFT' && item.workingResultId)
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

export function filterDraftRows(rows, search = '') {
  const query = String(search || '').trim().toLowerCase()
  if (!query) return rows
  return rows.filter(row => [row.testName, row.patientName, row.patientNumber, row.orderNumber].some(value => String(value || '').toLowerCase().includes(query)))
}

function draftRows(values) {
  return [...(values || [])]
    .sort((left, right) => (left?.displayOrder - right?.displayOrder) || String(left?.code || '').localeCompare(String(right?.code || '')) || String(left?.parameterId || '').localeCompare(String(right?.parameterId || '')))
    .map(value => {
      const resultType = value?.resultType === 'TEXT' ? 'TEXT' : 'NUMERIC'
      return {
        parameterId: String(value?.parameterId || ''),
        name: value?.name || '',
        resultType,
        unit: value?.unit || '',
        reference: referenceLabel(value),
        referenceText: value?.referenceText == null ? null : String(value.referenceText),
        referenceMin: value?.referenceMin ?? null,
        referenceMax: value?.referenceMax ?? null,
        required: value?.required === true,
        flag: FLAGS.has(value?.flag) ? value.flag : 'NOT_EVALUATED',
        valueText: resultType === 'TEXT' ? (value?.textValue ?? '') : (value?.numericValue == null ? '' : String(value.numericValue)),
        comparator: resultType === 'TEXT' || !COMPARATORS.has(value?.numericComparator) ? '' : value.numericComparator,
        notes: value?.notes ?? '',
      }
    })
}

export function editorState(result, samples, visits, language) {
  const eligible = eligibleReceivedSamples(samples, visits, result?.orderItemId)
  const linked = new Set((result?.specimens || []).map(item => String(item?.id || '')).filter(Boolean))
  return {
    version: rejectionVersion(result?.version),
    status: result?.status || '',
    testName: result?.testName || '',
    patientName: result?.patient?.name || '',
    patientNumber: result?.patient?.number || '',
    orderNumber: result?.orderNumber || '',
    versionNumber: result?.versionNumber,
    measuredText: formatCollectionTime(result?.measuredAt, language),
    explanation: typeof result?.explanation === 'string' ? result.explanation : null,
    samples: eligible,
    selected: eligible.filter(sample => linked.has(sample.id)).map(sample => sample.id),
    rows: draftRows(result?.values),
  }
}

export function versionMark(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 0 ? `v${number}` : ''
}

export function draftPayload(form, { review = false } = {}) {
  const problems = []
  const version = rejectionVersion(form?.version)
  if (version == null) problems.push({ field: 'version' })
  let measuredAt = null
  if (String(form?.measuredText || '').trim()) {
    const parsed = parseCollectionTime(form.measuredText)
    if (!parsed || new Date(parsed).getTime() > Date.now()) problems.push({ field: 'measured' })
    else measuredAt = parsed
  } else if (review) problems.push({ field: 'measured' })
  const rows = form?.rows || []
  if (rows.length < 1 || rows.length > 200) problems.push({ field: 'values' })
  const seen = new Set()
  const values = []
  for (const row of rows) {
    const parameterId = String(row?.parameterId || '')
    if (!parameterId || seen.has(parameterId)) {
      problems.push({ field: 'values' })
      continue
    }
    seen.add(parameterId)
    let flag = FLAGS.has(row.flag) ? row.flag : 'NOT_EVALUATED'
    const notes = cleanText(row.notes, 2000)
    if (Number.isNaN(notes)) problems.push({ field: 'note', id: parameterId })
    const referenceText = row.referenceText == null || row.referenceText === '' ? null : String(row.referenceText)
    const referenceMin = storedDecimal(row.referenceMin)
    const referenceMax = storedDecimal(row.referenceMax)
    if (Number.isNaN(referenceMin) || Number.isNaN(referenceMax)) problems.push({ field: 'reference', id: parameterId })
    if (referenceText != null && (referenceText.length > 2000 || CONTROL.test(referenceText))) problems.push({ field: 'reference', id: parameterId })
    let numericValue = null
    let textValue = null
    let numericComparator = null
    if (row.resultType === 'TEXT') {
      textValue = cleanText(row.valueText, 10000)
      if (Number.isNaN(textValue)) problems.push({ field: 'value', id: parameterId })
      if (row.comparator) problems.push({ field: 'comparator', id: parameterId })
    } else {
      numericValue = enteredNumber(row.valueText)
      if (Number.isNaN(numericValue)) problems.push({ field: 'value', id: parameterId })
      if (row.comparator && !COMPARATORS.has(row.comparator)) problems.push({ field: 'comparator', id: parameterId })
      if (row.comparator && numericValue == null) problems.push({ field: 'comparator', id: parameterId })
      if (COMPARATORS.has(row.comparator) && numericValue != null && !Number.isNaN(numericValue)) numericComparator = row.comparator
    }
    const valueMissing = numericValue == null && textValue == null && !Number.isNaN(numericValue) && !Number.isNaN(textValue)
    if (valueMissing && !row.comparator) flag = 'NOT_EVALUATED'
    if (valueMissing && flag !== 'NOT_EVALUATED') problems.push({ field: 'value', id: parameterId })
    if (review && row.required && valueMissing) problems.push({ field: 'value', id: parameterId })
    values.push({
      parameterId,
      numericValue: Number.isNaN(numericValue) ? null : numericValue,
      numericComparator,
      textValue: Number.isNaN(textValue) ? null : textValue,
      referenceText,
      referenceMin: Number.isNaN(referenceMin) ? null : referenceMin,
      referenceMax: Number.isNaN(referenceMax) ? null : referenceMax,
      flag,
      notes: Number.isNaN(notes) ? null : notes,
    })
  }
  const selected = new Set(form?.selected || [])
  const specimenIds = (form?.samples || []).map(sample => sample.id).filter(id => selected.has(id))
  if (review && specimenIds.length < 1) problems.push({ field: 'samples' })
  if (problems.length) return { ok: false, problems }
  return {
    ok: true,
    problems,
    body: {
      expectedVersion: version,
      measuredAt,
      specimenIds,
      explanation: typeof form?.explanation === 'string' && form.explanation.trim() ? form.explanation.trim() : null,
      values,
    },
  }
}

export function problemKey(problem) {
  return problem?.id ? `${problem.field}:${problem.id}` : problem?.field || ''
}
