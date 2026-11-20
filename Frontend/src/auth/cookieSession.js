import { coordinateRequest, invalidateSession, rememberSession, sessionIdentity, sessionSignal, sessionStarted } from './sessionState.js'

function authError(code, status) {
  return Object.assign(new Error(code), { code, status })
}

async function read(path, { signal, method = 'GET', body, csrf, requestId, pdf } = {}) {
  const headers = { Accept: 'application/json' }
  if (requestId) headers['Idempotency-Key'] = requestId
  if (pdf) headers.Accept = 'application/pdf'
  if (body) headers['Content-Type'] = 'application/json'
  if (csrf) headers['X-XSRF-TOKEN'] = csrf
  const response = await fetch(path, {
    method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers, signal, body: body && JSON.stringify(body),
  })
  const type = response.headers.get('content-type')
  const data = type?.includes('application/json') ? await response.json()
    : pdf && response.ok && type?.includes('application/pdf') ? await response.blob() : null
  signal?.throwIfAborted()
  return { response, data }
}

function requireSuccess({ response, data }, fallback = 'SERVICE_UNAVAILABLE') {
  if (!response.ok || !data) throw authError(data?.code || fallback, response.status)
  return data
}

function currentCsrf() {
  const cookie = document.cookie.split(/;\s*/).find(value => value.startsWith('XSRF-TOKEN='))
  return cookie ? decodeURIComponent(cookie.slice('XSRF-TOKEN='.length)) : ''
}

async function initializeCsrf(signal) {
  // An authenticated read can clear the cookie. Issue it just before a write.
  requireSuccess(await read('/api/auth/csrf-token', { signal }))
  const token = currentCsrf()
  if (!token) throw authError('SERVICE_UNAVAILABLE')
  return token
}

function protectedSignal(signal) {
  return signal ? AbortSignal.any([signal, sessionSignal()]) : sessionSignal()
}

export function getCookieAccess({ signal } = {}) {
  const scope = protectedSignal(signal)
  return coordinateRequest(false, scope, () => readCookieAccess(scope))
}

function signedOut() {
  if (sessionIdentity()) invalidateSession()
  return { authenticated: false }
}

async function readCookieAccess(signal) {
  signal?.throwIfAborted()
  const account = await read('/api/auth/me', { signal })
  if (account.response.status === 401) return signedOut()
  const user = requireSuccess(account)
  if (typeof user.id !== 'string' || !user.id || typeof user.role !== 'string') throw authError('SERVICE_UNAVAILABLE')
  const access = { authenticated: true, role: user.role.toLowerCase(), userId: user.id, displayName: user.fullName }
  if (access.role === 'patient') {
    access.emailVerified = user.emailConfirmed === true
    if (access.emailVerified) {
      const profile = await read('/api/patients/me', { signal })
      if (profile.response.status === 401) return signedOut()
      access.hasLinkedMedicalFile = profile.response.status === 404 && profile.data?.code === 'PATIENT_PROFILE_NOT_LINKED'
        ? false : Boolean(requireSuccess(profile))
    }
  }
  const previous = sessionIdentity()
  rememberSession(access)
  if (previous && previous !== sessionIdentity()) invalidateSession('changed')
  return access
}

export function loginWithCookie(credentials, { signal } = {}) {
  return coordinateRequest(true, signal, () => submitLogin(credentials, signal))
}

async function submitLogin({ email, password }, signal) {
  const csrf = await initializeCsrf(signal)
  const result = await read('/api/auth/cookie-login', {
    method: 'POST', body: { emailOrUserName: email, password }, csrf, signal,
  })
  const status = result.response.status
  if (status === 429) throw authError('RATE_LIMITED')
  if (requireSuccess(result, status === 401 ? 'INVALID_CREDENTIALS' : 'SERVICE_UNAVAILABLE').success !== true) throw authError('SERVICE_UNAVAILABLE')
  sessionStarted()
}

export function logoutWithCookie({ signal } = {}) {
  const scope = protectedSignal(signal)
  return coordinateRequest(true, scope, () => submitLogout(scope))
}

async function submitLogout(signal) {
  const csrf = await initializeCsrf(signal)
  const result = await read('/api/auth/logout', { method: 'POST', csrf, signal })
  if (result.response.status !== 401 && requireSuccess(result).success !== true) throw authError('SERVICE_UNAVAILABLE')
  // The server clears the HttpOnly session. Remove any readable CSRF cookie
  // left behind when the response carries only the session Set-Cookie header.
  if (currentCsrf()) document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
  invalidateSession()
}

export async function acceptAccountInvitation(body, { signal } = {}) {
  const result = await authenticatedRequest('/api/auth/set-password', { method: 'POST', body, signal, publicRequest: true })
  if (typeof result.message !== 'string') throw authError('SERVICE_UNAVAILABLE')
}

export function authenticatedRequest(path, { method = 'GET', body, signal, requestId, pdf, publicRequest = false } = {}) {
  if (!/^\/api\//.test(path)) return Promise.reject(authError('INVALID_API_PATH'))
  const scope = publicRequest ? signal : protectedSignal(signal)
  return coordinateRequest(method !== 'GET', scope, async () => {
    const csrf = method === 'GET' ? undefined : await initializeCsrf(scope)
    const result = await read(path, { method, body, signal: scope, csrf, requestId, pdf })
    if (!publicRequest && result.response.status === 401) invalidateSession()
    if (result.response.status === 204) return
    return requireSuccess(result)
  })
}
