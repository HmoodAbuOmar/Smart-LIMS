import { requestServiceOperation } from '../services/serviceTransport.js'

// Account/session operations only; patient-file writes remain outside auth.
export const authApi = Object.freeze({
  registerAccount: (payload, options) => requestServiceOperation('registerAccount', payload, options),
  login: (payload, options) => requestServiceOperation('login', payload, options),
  getAccess: options => requestServiceOperation('patientAccess', undefined, options),
  verifyEmail: (payload, options) => requestServiceOperation('verifyEmail', payload, options),
  resendVerification: (payload, options) => requestServiceOperation('resendVerification', payload, options),
  verificationStatus: (payload, options) => requestServiceOperation('verificationStatus', payload, options),
  requestPasswordReset: (payload, options) => requestServiceOperation('requestPasswordReset', payload, options),
  resetPassword: (payload, options) => requestServiceOperation('resetPassword', payload, options),
})
