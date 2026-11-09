import { authApi as patientApi } from './api.js'

// These paths become authorized destinations only after a trusted server response.
export function patientDestination(access) {
  if (access?.authenticated !== true) return '#/login'
  if (access.role !== 'patient') return null // Preserve real role routing when supplied.
  if (access.emailVerified !== true) return '#/verify-email'
  if (access.hasLinkedMedicalFile === true) return '#/patient/dashboard'
  if (access.hasLinkedMedicalFile === false) return '#/patient/file'
  return null
}

// Never render arbitrary server exception text. Adapter errors use these normalized codes.
export function actionErrorKey(code, fallback) {
  const keys = { INVALID_CREDENTIALS: 'errors.invalidCredentials', RATE_LIMITED: 'errors.rateLimited', EMAIL_NOT_VERIFIED: 'errors.emailNotVerified', TOKEN_EXPIRED: 'errors.tokenExpired', TOKEN_INVALID: 'errors.tokenInvalid', SESSION_EXPIRED: 'errors.sessionExpired' }
  return typeof code === 'string' && Object.hasOwn(keys, code) ? keys[code] : fallback
}

export async function authenticatedPatientDestination(options) {
  const destination = patientDestination(await patientApi.getAccess(options))
  options?.signal?.throwIfAborted()
  if (!destination) throw new Error('Authoritative patient access is required')
  return destination
}
