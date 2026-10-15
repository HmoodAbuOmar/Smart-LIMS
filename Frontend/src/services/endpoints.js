/**
 * Central API path map — wire to Spring Boot when backend is ready.
 * Do not call these URLs until integration is verified.
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export const endpoints = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    me: '/api/auth/me',
    logout: '/api/auth/logout',
    forgotPassword: '/api/auth/forgot-password',
    resetPassword: '/api/auth/reset-password',
  },
  users: '/api/users',
  patients: '/api/patients',
  labTests: '/api/laboratory-tests',
  orders: '/api/test-orders',
  appointments: '/api/appointments',
  payments: '/api/payments',
  samples: '/api/samples',
  results: '/api/test-results',
  notifications: '/api/notifications',
  auditLogs: '/api/audit-logs',
  /** Intended lab workflow paths (integrate when backend is ready). */
  lab: {
    orderSamples: (orderId) => `/api/orders/${orderId}/samples`,
    sample: (sampleId) => `/api/samples/${sampleId}`,
    sampleTests: (sampleId) => `/api/samples/${sampleId}/tests`,
    sampleTestResults: (sampleTestId) => `/api/sample-tests/${sampleTestId}/results`,
    result: (resultId) => `/api/results/${resultId}`,
    publishResult: (resultId) => `/api/results/${resultId}/publish`,
    correctResult: (resultId) => `/api/results/${resultId}/correct`,
  },
}
