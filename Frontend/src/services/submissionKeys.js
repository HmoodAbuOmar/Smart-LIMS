const prefix = 'smart-lims.pending-write.'

export function createSubmissionKeys(storage, makeKey = () => crypto.randomUUID()) {
  const keys = new Map()
  return {
    get(fingerprint) {
      let key = keys.get(fingerprint)
      try { key ||= storage?.getItem(prefix + fingerprint) } catch { /* Memory fallback. */ }
      if (!key) key = makeKey()
      keys.set(fingerprint, key)
      try { storage?.setItem(prefix + fingerprint, key) } catch { /* Memory fallback. */ }
      return key
    },
    complete(fingerprint) {
      keys.delete(fingerprint)
      try { storage?.removeItem(prefix + fingerprint) } catch { /* Memory fallback. */ }
    },
  }
}

export async function submissionFingerprint(owner, operation, payload) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([owner, operation, payload])))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function clearPendingSubmissions(storage) {
  try {
    storage ||= globalThis.sessionStorage
    for (let i = (storage?.length || 0) - 1; i >= 0; i--) {
      const key = storage.key(i)
      if (key?.startsWith(prefix)) storage.removeItem(key)
    }
  } catch { /* Storage can be blocked. */ }
}
