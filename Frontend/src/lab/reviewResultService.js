import { authenticatedRequest } from '../auth/cookieSession.js'

const EXPECTED = { approve: 'APPROVED', publish: 'PUBLISHED' }

// Confirmed staff routes: POST /api/results/{id}/approve and
// POST /api/results/{id}/publish, each with { expectedVersion }.
// Both require an authorized administrator reviewer.
export async function submitResultReview(resultId, action, version, options) {
  const expected = EXPECTED[action]
  if (!expected || !Number.isInteger(version) || version < 0) return { confirmed: false }
  const saved = await authenticatedRequest(`/api/results/${encodeURIComponent(resultId)}/${action}`, {
    method: 'POST',
    body: { expectedVersion: version },
    signal: options?.signal,
  })
  if (String(saved?.id) !== String(resultId) || saved?.status !== expected || !Number.isInteger(saved?.version) || saved.version < 0) {
    return { confirmed: false }
  }
  return { confirmed: true, result: saved }
}
