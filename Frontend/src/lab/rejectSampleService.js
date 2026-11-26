import { authenticatedRequest } from '../auth/cookieSession.js'
import { queryApi } from '../services/apiQuery.js'
import { rejectionVersion } from './sampleListModel.js'

export async function loadRejectionVersion(sampleId, options) {
  const sample = await queryApi(`/api/samples/${sampleId}`, {}, options)
  return rejectionVersion(sample?.version)
}

// POST /api/samples/{id}/reject accepts the current version and a non-blank
// reason. Success is only the returned record for that same sample with status
// REJECTED. Anything else stays unconfirmed.
export async function submitRejection({ id, expectedVersion, reason }, options) {
  const saved = await authenticatedRequest(`/api/samples/${id}/reject`, {
    method: 'POST',
    body: { expectedVersion, reason: String(reason).trim() },
    signal: options?.signal,
  })
  if (String(saved?.id) !== String(id) || saved?.status !== 'REJECTED') return { confirmed: false }
  return { confirmed: true, sample: saved }
}
