import { authenticatedRequest } from '../auth/cookieSession.js'
import { listApi, queryApi } from '../services/apiQuery.js'
import { createSubmissionKeys, submissionFingerprint } from '../services/submissionKeys.js'
import { groupCollectionOrders, normalizeReplacement } from './collectSampleModel.js'

export async function loadCollectionOrders(options) {
  const items = await listApi('/api/results/work-items', {}, options)
  return groupCollectionOrders(items)
}

export async function loadSampleTypes(options) {
  const types = await queryApi('/api/lab-tests/sample-types', {}, options)
  return Array.isArray(types) ? types.filter(type => typeof type === 'string' && type.trim()) : []
}

// POST /api/samples records a specimen for a visit and accepts only visitId,
// sampleType, containerType, collectedAt, and replacesSampleId. Unknown fields
// are rejected, so the selected tests and notes cannot be submitted with it.
// POST /api/samples/{id}/attestations links one test only after the specimen is
// RECEIVED. Receipt is a separate action and is not part of collection.
// Nothing is sent here: a specimen write would drop the tests this form requires,
// and this function never reports a save the server did not confirm.
export function submitCollection() {
  return { confirmed: false, reason: 'COLLECTION_LINK_UNSUPPORTED' }
}

export async function loadReplacementSource(sampleId, options) {
  const [sample, items] = await Promise.all([
    queryApi(`/api/samples/${sampleId}`, {}, options),
    listApi('/api/results/work-items', {}, options),
  ])
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
  return normalizeReplacement({ ...sample, orderNumber, patientName }, names)
}

// POST /api/samples is the replacement contract. replacesSampleId is required
// here and must be the rejected sample. Notes and test selections are not
// accepted, so they are never sent. The returned record has to point at that
// rejected sample before the caller may report success.
export async function submitReplacement({ visitId, sampleType, containerType, collectedAt, replacesSampleId }, options) {
  const body = {
    visitId,
    sampleType: String(sampleType).trim(),
    containerType: String(containerType).trim() || null,
    collectedAt,
    replacesSampleId,
  }
  const fingerprint = await submissionFingerprint('lab', 'replace-sample', body)
  const keys = createSubmissionKeys(globalThis.sessionStorage)
  const saved = await authenticatedRequest('/api/samples', { method: 'POST', body, signal: options?.signal, requestId: keys.get(fingerprint) })
  if (String(saved?.replacesSampleId || '').toLowerCase() !== String(replacesSampleId).toLowerCase()) {
    return { confirmed: false }
  }
  keys.complete(fingerprint)
  return { confirmed: true, sample: saved }
}
