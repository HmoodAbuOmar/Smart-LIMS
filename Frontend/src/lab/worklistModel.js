export const STATUS_FILTERS = ['ALL', 'REGISTERED', 'RECEIVED', 'REJECTED', 'DRAFT', 'APPROVED', 'PUBLISHED']

const SAMPLE_RANK = { RECEIVED: 3, REGISTERED: 2, REJECTED: 1 }

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right)
}

function preferredSample(samples) {
  return samples.reduce((best, sample) => ((SAMPLE_RANK[sample.status] || 0) > (SAMPLE_RANK[best.status] || 0) ? sample : best))
}

export function sampleStatusForItem(item, samples) {
  const onOrder = samples.filter(sample => sameId(sample.orderId, item.orderId))
  const attested = onOrder.filter(sample => sample.attestations?.some(link => sameId(link.orderItemId, item.orderItemId)))
  if (attested.length) return preferredSample(attested).status
  const unlinked = onOrder.filter(sample => !sample.attestations?.length)
  return unlinked.length ? preferredSample(unlinked).status : null
}

export function resultStatusForItem(item) {
  if (item.workingState === 'DRAFT' || item.workingState === 'APPROVED') return item.workingState
  if (item.currentResultId) return 'PUBLISHED'
  return null
}

export function worklistRows(items, samples) {
  return items.map(item => ({
    ...item,
    sampleStatus: sampleStatusForItem(item, samples),
    resultStatus: resultStatusForItem(item),
  }))
}

export function filterWorklist(rows, { search = '', status = 'ALL' } = {}) {
  const query = search.trim().toLowerCase()
  return rows.filter(row => {
    const matchesQuery = !query || [row.patientName, row.orderNumber, row.orderId].some(value => String(value || '').toLowerCase().includes(query))
    const matchesStatus = status === 'ALL' || row.sampleStatus === status || row.resultStatus === status
    return matchesQuery && matchesStatus
  })
}

// Ordered tests are non-cancelled work items. Received samples are distinct
// RECEIVED specimens. Pending publication is an approved working result.
export function worklistCounts(items, samples) {
  return {
    orderedTests: items.length,
    receivedSamples: new Set(samples.filter(sample => sample.status === 'RECEIVED').map(sample => sample.id)).size,
    pendingPublication: items.filter(item => item.workingState === 'APPROVED').length,
  }
}

export function rowAction(row) {
  return row.resultStatus === 'DRAFT' && row.workingResultId ? 'openDraft' : 'openTest'
}
