import { authApi } from '../auth/api.js'
import { requestServiceOperation } from './serviceTransport.js'
export { patientDestination, authenticatedPatientDestination, actionErrorKey } from '../auth/access.js'

const operations = new Set(['registerAccount', 'login', 'patientAccess', 'createFile', 'linkFile', 'verifyEmail', 'resendVerification', 'verificationStatus', 'requestPasswordReset', 'resetPassword'])

// Preserve the existing public service interface for patient/onboarding consumers.
export async function requestPatientOperation(operation, payload, { signal } = {}) {
  signal?.throwIfAborted()
  if (!operations.has(operation)) throw new Error('Unknown patient operation')
  return requestServiceOperation(operation, payload, { signal })
}

export const patientApi = Object.freeze({
  ...authApi,
  createFile: (payload, options) => requestPatientOperation('createFile', payload, options),
  linkFile: (payload, options) => requestPatientOperation('linkFile', payload, options),
})
