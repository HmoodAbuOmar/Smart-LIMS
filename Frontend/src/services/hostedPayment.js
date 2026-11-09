// Configure once from a reviewed processor SDK integration in application code.
// No URL, storage flag or patient input can configure a payment processor.
let provider
export function configureHostedPaymentProvider(adapter) {
  if (!adapter || typeof adapter.mount !== 'function' || !Array.isArray(adapter.frameOrigins) || !adapter.frameOrigins.length) throw new Error('Invalid hosted payment adapter')
  const origins = new Set(adapter.frameOrigins.map(value => {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.origin !== value) throw new Error('Processor HTTPS origin required')
    return url.origin
  }))
  provider = { mount: options => adapter.mount(options), origins }
}
export async function mountHostedPaymentFields(options) {
  if (!provider) return null
  const fields = await provider.mount(options)
  if (options.signal.aborted) { fields?.destroy?.(); return null }
  const hosted = Object.values(options.containers).every(container => {
    const frame = container.querySelector('iframe')
    if (!frame || container.querySelector('input,textarea,[contenteditable=true]')) return false
    try { const url = new URL(frame.src); return url.protocol === 'https:' && url.origin !== window.location.origin && provider.origins.has(url.origin) } catch { return false }
  })
  if (!hosted || !fields || !['validate', 'confirm', 'destroy'].every(method => typeof fields[method] === 'function')) {
    fields?.destroy?.()
    throw new Error('Provider must supply cross-origin hosted fields')
  }
  return fields
}
// Only an opaque provider reference can cross into the booking adapter.
export function paymentReference(result) {
  const reference = result?.paymentReference
  if (typeof reference !== 'string' || !/^[A-Za-z][A-Za-z0-9_:-]{0,199}$/.test(reference)) throw new Error('Provider reference unavailable')
  return reference
}
export function validReceiptEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) }
export async function processHostedPayment({ api, payload, receiptEmail, confirmCard, expectedAmount }) {
  if (typeof confirmCard !== 'function' || !validReceiptEmail(receiptEmail || '') || !Number.isFinite(expectedAmount) || expectedAmount < 0) throw new Error('Hosted payment unavailable')
  const session = await api.createHostedPayment({ ...payload, receiptEmail: receiptEmail.trim() })
  if (typeof session?.id !== 'string' || !session.id || session.currency !== 'ILS' || session.amount !== expectedAmount) throw new Error('Hosted quote unavailable')
  const reference = paymentReference({ paymentReference: await confirmCard(session) })
  // A browser SDK response is not proof of payment. Only the server's provider
  // verification and atomic booking save can satisfy the final receipt guard.
  const result = await api.verifyPaymentAndBooking({ ...payload, paymentSessionId: session.id, paymentReference: reference })
  if (result?.confirmed === true && (result.currency !== 'ILS' || result.appointment?.total !== expectedAmount || result.order?.total !== expectedAmount)) throw new Error('Booking quote was not confirmed')
  return result
}
