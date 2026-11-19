import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authApi } from './api.js'

export default function SessionSignOut({ onSignedOut }) {
  const { t } = useTranslation('auth')
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  async function signOut() {
    if (lock.current) return
    lock.current = true
    setPending(true)
    setFailed(false)
    try {
      await authApi.logout()
      onSignedOut?.()
      window.location.hash = '/login'
    } catch { setFailed(true) }
    finally { lock.current = false; setPending(false) }
  }
  return <>
    <button className="auth-secondary" type="button" disabled={pending} onClick={signOut}>
      {t(pending ? 'actions.signingOut' : 'actions.signOut')}
    </button>
    {failed && <p role="alert">{t('errors.logoutUnavailable')}</p>}
  </>
}
