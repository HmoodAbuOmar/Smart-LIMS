import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { patientApi, patientDestination } from '../services/patientApi.js'
import { portalApi } from '../services/portalApi.js'
import PatientPortal from './PatientPortal.jsx'

// The development entry never imports this guard or obtains an authentication session.
export default function PortalEntry({ route }) {
  const { t } = useTranslation('portal')
  const [status, setStatus] = useState('loading'), [data, setData] = useState(null), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const access = await patientApi.getAccess({ signal: controller.signal })
        if (controller.signal.aborted) return
        const destination = patientDestination(access)
        if (destination !== '#/patient/dashboard') {
          if (destination) window.location.hash = destination.slice(1)
          else setStatus('unavailable')
          return
        }
        const workspace = await portalApi.loadWorkspace({ signal: controller.signal })
        if (!controller.signal.aborted) { setData(workspace); setStatus('ready') }
      } catch { if (!controller.signal.aborted) setStatus('unavailable') }
    }
    void load()
    return () => controller.abort()
  }, [attempt])
  if (status === 'ready') return <PatientPortal initialData={data} route={route} onNavigate={path => { window.location.hash = `/patient/${path}` }} onExit={async () => { try { await portalApi.logout(); window.location.hash = '/login' } catch { setStatus('unavailable'); setData(null) } }} />
  return <main className="portal-access" aria-busy={status === 'loading'}><h1>{t('dashboard')}</h1>{status === 'loading' ? <p role="status">{t('loading')}</p> : <><p role="alert">{t('unavailable')}</p><button className="portal-button" onClick={() => { setStatus('loading'); setAttempt(a => a + 1) }}>{t('retry')}</button><a href="#/login">{t('login')}</a></>}</main>
}
