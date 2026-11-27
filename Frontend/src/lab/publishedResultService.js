import { listApi } from '../services/apiQuery.js'
import { loadDraftResult } from './draftResultService.js'

// Confirmed staff reads: GET /api/results/{id} and
// GET /api/results/versions?orderItemId={id}. There is no staff PDF route;
// printing uses the browser print dialog.
export function loadPublishedResult(resultId, options) {
  return loadDraftResult(resultId, options)
}

export function loadPublishedHistory(orderItemId, options) {
  return listApi('/api/results/versions', { orderItemId: String(orderItemId) }, options)
}

export function loadPublishedWorkItems(options) {
  return listApi('/api/results/work-items', {}, options)
}
