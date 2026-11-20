import { authenticatedRequest } from '../auth/cookieSession.js'

export const patientApi = Object.freeze({
  createFile: (payload, options) => saveFile('/api/patients/me', { ...payload, gender: payload.gender.toUpperCase() }, 'fileCreated', options),
  linkFile: (payload, options) => saveFile('/api/patients/me/link', { token: payload.fileIdentifier }, 'verifiedLink', options),
})

async function saveFile(path, body, confirmation, { signal } = {}) {
  const record = await authenticatedRequest(path, { method: 'POST', body, signal })
  return { [confirmation]: Boolean(record.id && record.patientNumber) }
}
