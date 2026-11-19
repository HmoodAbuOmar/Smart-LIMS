function authError(code) {
  return Object.assign(new Error(code), { code })
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
  return { response, data }
}

function requireSuccess({ response, data }, fallback = 'SERVICE_UNAVAILABLE') {
  if (!response.ok || !data) throw authError(data?.code || fallback)
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

export async function getCookieAccess({ signal } = {}) {
  signal?.throwIfAborted()
  const account = await read('/api/auth/me', { signal })
  if (account.response.status === 401) return { authenticated: false }
  const user = requireSuccess(account)
  if (typeof user.id !== 'string' || !user.id || typeof user.role !== 'string') throw authError('SERVICE_UNAVAILABLE')
  const access = { authenticated: true, role: user.role.toLowerCase(), userId: user.id, displayName: user.fullName }
  if (access.role === 'patient') {
    access.emailVerified = user.emailConfirmed === true
    if (!access.emailVerified) return access
    const profile = await read('/api/patients/me', { signal })
    if (profile.response.status === 401) return { authenticated: false }
    access.hasLinkedMedicalFile = profile.response.status === 404 && profile.data?.code === 'PATIENT_PROFILE_NOT_LINKED'
      ? false : Boolean(requireSuccess(profile))
  }
  return access
}

export async function loginWithCookie({ email, password }, { signal } = {}) {
  signal?.throwIfAborted()
  const csrf = await initializeCsrf(signal)
  const result = await read('/api/auth/cookie-login', {
    method: 'POST', body: { emailOrUserName: email, password }, csrf, signal,
  })
  const status = result.response.status
  if (status === 429) throw authError('RATE_LIMITED')
  if (requireSuccess(result, status === 401 ? 'INVALID_CREDENTIALS' : 'SERVICE_UNAVAILABLE').success !== true) throw authError('SERVICE_UNAVAILABLE')
}

export async function logoutWithCookie({ signal } = {}) {
  signal?.throwIfAborted()
  const csrf = await initializeCsrf(signal)
  const result = await read('/api/auth/logout', { method: 'POST', csrf, signal })
  if (requireSuccess(result).success !== true) throw authError('SERVICE_UNAVAILABLE')
  // The server clears the HttpOnly session. Remove any readable CSRF cookie
  // left behind when the response carries only the session Set-Cookie header.
  if (currentCsrf()) document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/'
}

export async function acceptAccountInvitation(body, { signal } = {}) {
  signal?.throwIfAborted()
  const csrf = await initializeCsrf(signal)
  const result = requireSuccess(await read('/api/auth/set-password', { method: 'POST', body, csrf, signal }))
  if (typeof result.message !== 'string') throw authError('SERVICE_UNAVAILABLE')
}

export async function authenticatedRequest(path, { method = 'GET', body, signal, requestId, pdf } = {}) {
  const csrf = method === 'GET' ? undefined : await initializeCsrf(signal)
  const result = await read(path, { method, body, signal, csrf, requestId, pdf })
  if (result.response.status === 204) return
  return requireSuccess(result)
}
