import { authenticatedRequest } from '../auth/cookieSession.js'
import { listApi, queryApi } from '../services/apiQuery.js'
import { linkedTests, rejectionVersion, replacementReference } from './sampleListModel.js'

export async function loadSampleDetails(sampleId, options) {
  const sample = await queryApi(`/api/samples/${sampleId}`, {}, options)
  const items = await listApi('/api/results/work-items', {}, options)
  const names = new Map()
  let orderNumber = ''
  let patientName = ''
  for (const item of items || []) {
    if (String(item?.orderId) !== String(sample?.orderId)) continue
    if (!orderNumber) {
      orderNumber = item.orderNumber || ''
      patientName = item.patientName || ''
    }
    if (item.orderItemId) names.set(String(item.orderItemId), item.testName || '')
  }
  let siblings = []
  try {
    siblings = await listApi('/api/samples', { orderId: sample.orderId }, options)
  } catch (error) {
    if (error?.status !== 404) throw error
  }
  return {
    ...sample,
    orderNumber,
    patientName,
    tests: linkedTests(sample, names),
    replacement: replacementReference(sample, siblings),
    workItems: (items || []).filter(item => String(item?.orderId) === String(sample?.orderId)),
  }
}

// POST /api/samples/{id}/receive records receipt for the current version.
// Success requires the same sample to come back as RECEIVED.
export async function submitReceipt({ id, expectedVersion }, options) {
  const saved = await authenticatedRequest(`/api/samples/${id}/receive`, {
    method: 'POST',
    body: { expectedVersion },
    signal: options?.signal,
  })
  if (String(saved?.id) !== String(id) || saved?.status !== 'RECEIVED') return { confirmed: false }
  return { confirmed: true, sample: saved }
}

export function receiptVersion(sample) {
  return rejectionVersion(sample?.version)
}
