// Shared transport boundary, unchanged unavailable behavior; no endpoint is invented.
export async function requestServiceOperation(_operation, payload, { signal } = {}) {
  signal?.throwIfAborted()
  // payload must go directly to the future transport, never storage or logging.
  void payload
  const error = new Error('Patient service transport is not configured')
  error.code = 'SERVICE_UNAVAILABLE'
  throw error
}
