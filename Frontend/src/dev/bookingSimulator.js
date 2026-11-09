// No card input, provider tokens, network requests, storage or real transactions.
export async function simulateBookingPayment({ requestId, method, outcome = 'approved' }) {
  if (!import.meta.env.DEV) throw new Error('Development simulator is disabled')
  await new Promise(resolve => setTimeout(resolve, 300))
  if (!requestId || !['online', 'laboratory'].includes(method)) throw new Error('Invalid simulation request')
  if (method === 'online' && outcome !== 'approved') {
    const error = new Error('Development payment did not succeed')
    error.code = outcome === 'declined' ? 'PAYMENT_DECLINED' : 'SERVICE_UNAVAILABLE'
    throw error
  }
  return { source: 'development-simulator', requestId, method, outcome: 'approved' }
}
