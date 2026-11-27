import { authenticatedRequest } from '../auth/cookieSession.js'
import { listApi, queryApi } from '../services/apiQuery.js'
import { createSubmissionKeys, submissionFingerprint } from '../services/submissionKeys.js'

export async function loadDraftResult(resultId, options) {
  const result = await queryApi(`/api/results/${encodeURIComponent(resultId)}`, {}, options)
  if (!result || typeof result !== 'object' || String(result.id) !== String(resultId)) {
    throw Object.assign(new Error('SERVICE_UNAVAILABLE'), { code: 'SERVICE_UNAVAILABLE', status: 502 })
  }
  return result
}

export async function loadDraftEvidence(orderId, options) {
  const [samples, visits] = await Promise.all([
    listApi('/api/samples', { orderId }, options),
    listApi('/api/visits', { orderId }, options),
  ])
  return { samples, visits }
}

export async function createOrOpenDraft(orderItemId, options) {
  const body = { orderItemId: String(orderItemId) }
  const fingerprint = await submissionFingerprint('lab', 'create-draft', body)
  const keys = createSubmissionKeys(globalThis.sessionStorage)
  try {
    const saved = await authenticatedRequest('/api/results', {
      method: 'POST',
      body,
      signal: options?.signal,
      requestId: keys.get(fingerprint),
    })
    if (String(saved?.orderItemId) !== String(orderItemId) || saved?.status !== 'DRAFT' || !saved?.id) return { confirmed: false }
    keys.complete(fingerprint)
    return { confirmed: true, id: String(saved.id) }
  } catch (error) {
    if (options?.signal?.aborted || error?.code !== 'RESULT_WORKING_VERSION_EXISTS') throw error
    const versions = await listApi('/api/results/versions', { orderItemId: String(orderItemId) }, options)
    const draft = (versions || []).find(row => row?.status === 'DRAFT' && row.id)
    if (!draft) throw error
    return { confirmed: true, id: String(draft.id) }
  }
}

export async function saveDraft(resultId, body, options) {
  const saved = await authenticatedRequest(`/api/results/${encodeURIComponent(resultId)}`, {
    method: 'PUT',
    body,
    signal: options?.signal,
  })
  if (String(saved?.id) !== String(resultId) || saved?.status !== 'DRAFT' || !Number.isInteger(saved?.version) || saved.version < 0) {
    return { confirmed: false }
  }
  return { confirmed: true, result: saved }
}
