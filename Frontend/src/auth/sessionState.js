import { clearPendingSubmissions } from '../services/submissionKeys.js'

const sessionEventKey = 'smart-lims.session-event'
const listeners = new Set()
let scope = new AbortController()
let revision = 0
let identity
let requestQueue = Promise.resolve()

export const sessionRevision = () => revision
export const sessionSignal = () => scope.signal
export const sessionIdentity = () => identity
export function rememberSession(access) {
  identity = access?.authenticated
    ? JSON.stringify([access.userId, access.role, access.emailVerified, access.hasLinkedMedicalFile]) : undefined
}

function clearSession(reason, notify = true) {
  scope.abort()
  scope = new AbortController()
  identity = undefined
  clearPendingSubmissions()
  if (!notify) return
  revision += 1
  for (const listener of listeners) listener(reason)
}

function broadcast(reason) {
  try {
    globalThis.localStorage?.setItem(sessionEventKey, JSON.stringify({ reason, nonce: crypto.randomUUID() }))
  } catch { /* Focus revalidation still works if storage is blocked. */ }
}

export function invalidateSession(reason = 'signed-out') {
  clearSession(reason)
  broadcast(reason)
}

export function sessionStarted() {
  clearSession('changed', false)
  broadcast('changed')
}

function onStorage(event) {
  if (event.key !== sessionEventKey || !event.newValue) return
  try {
    const { reason } = JSON.parse(event.newValue)
    if (reason === 'changed' || reason === 'signed-out') clearSession(reason)
  } catch { /* Ignore invalid storage events. */ }
}

export function subscribeSession(listener) {
  if (!listeners.size) globalThis.window?.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) globalThis.window?.removeEventListener('storage', onStorage)
  }
}

// Reads can change the backend's CSRF cookie. Keep them out of the
// issuance/dispatch window, while allowing concurrent reads with Web Locks.
export function coordinateRequest(write, signal, run) {
  const execute = () => { signal?.throwIfAborted(); return run() }
  if (globalThis.navigator?.locks) {
    return navigator.locks.request('smart-lims.cookie-api', { mode: write ? 'exclusive' : 'shared', ...(signal && { signal }) }, execute)
  }
  const next = requestQueue.then(execute)
  requestQueue = next.catch(() => {})
  return next
}
