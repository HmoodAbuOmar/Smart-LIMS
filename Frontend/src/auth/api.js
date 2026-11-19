import { requestServiceOperation } from '../services/serviceTransport.js'
import { authenticatedRequest, getCookieAccess, loginWithCookie, logoutWithCookie } from './cookieSession.js'

const post = (path, body, { signal } = {}) => authenticatedRequest(path, { method: 'POST', body, signal })

// Account/session operations only; patient-file writes remain outside auth.
export const authApi = Object.freeze({
  registerAccount: async (payload, options) => {
    await post('/api/auth/register', payload, options)
    return { accountCreated: true }
  },
  login: loginWithCookie,
  getAccess: getCookieAccess,
  logout: logoutWithCookie,
  verifyEmail: async ({ userId, token }, options) => {
    await authenticatedRequest('/api/auth/confirm-email?' + new URLSearchParams({ userId, token }), options)
    return { status: 'verified' }
  },
  resendVerification: (payload, options) => requestServiceOperation('resendVerification', payload, options),
  verificationStatus: (payload, options) => requestServiceOperation('verificationStatus', payload, options),
  requestPasswordReset: async (payload, options) => ({ accepted: (await post('/api/auth/forgot-password', payload, options)).success === true }),
  resetPassword: async (payload, options) => ({ passwordReset: (await post('/api/auth/reset-password', payload, options)).success === true }),
})
