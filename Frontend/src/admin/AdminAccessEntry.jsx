import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountDestination } from '../auth/access.js'
import { authApi } from '../auth/api.js'
import AdminDashboard from './AdminDashboard.jsx'

export default function AdminAccessEntry() {
  const { t } = useTranslation('auth')
  const [state, setState] = useState('loading')
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    authApi.getAccess({ signal: controller.signal }).then(access => {
      if (controller.signal.aborted) return
      if (access.authenticated && access.role === 'admin') { setProfile(access); setState('ready') }
      else {
        const destination = accountDestination(access)
        if (destination) window.location.replace(destination)
        else setState('error')
      }
    }, () => { if (!controller.signal.aborted) setState('error') })
    return () => controller.abort()
  }, [])
  if (state === 'ready') return <AdminDashboard live profile={profile} />
  return <main className="admin-access">
    <h1>{t('workspace.admin')}</h1>
    <p role={state === 'loading' ? 'status' : 'alert'}>{t(state === 'loading' ? 'actions.loading' : 'errors.accessUnavailable')}</p>
    {state === 'error' && <a href="#/login">{t('tabs.login')}</a>}
  </main>
}
