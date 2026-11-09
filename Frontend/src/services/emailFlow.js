import { validateAuth } from '../utils/authValidation.js'

export function validateEmail({ email }) {
  if (!email.trim()) return { email: 'emailRequired' }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? {} : { email: 'emailInvalid' }
}

export function validatePasswordReset(values) {
  const errors = validateAuth({ name: '', email: '', ...values }, 'signup')
  return Object.fromEntries(['password', 'confirmPassword'].filter(field => errors[field]).map(field => [field, errors[field]]))
}

// Keep link secrets in memory only, and remove them from address/history immediately.
export function readLinkToken(location) {
  const hashQuery = location.hash.split('?')[1] || ''
  return new URLSearchParams(hashQuery).get('token') || new URLSearchParams(location.search || '').get('token') || ''
}
export function clearLinkToken() {
  const url = new URL(window.location.href)
  url.searchParams.delete('token')
  url.hash = url.hash.split('?')[0]
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}
