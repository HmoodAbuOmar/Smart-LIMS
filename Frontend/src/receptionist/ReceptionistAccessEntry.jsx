import { appointmentsCopy } from './appointments/appointmentsCopy.js'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { authApi } from '../auth/api.js'
import { accountDestination } from '../auth/access.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import WorkspaceRoleLabel from '../components/WorkspaceRoleLabel.jsx'
import WorkspaceAccountMenu from '../components/WorkspaceAccountMenu.jsx'
import { todayCopy } from './today/todayCopy.js'
import { patientsCopy } from './patients/patientsCopy.js'
import { walkInCopy } from './walk-in/walkInCopy.js'
import { ordersCopy } from './orders/ordersCopy.js'
import './today/today.css'

const paymentUnavailable = {
  en: 'Staff payment services are unavailable.',
  ar: 'خدمات الدفع للموظفين غير متاحة.',
}

// The staff session can be confirmed independently of workspace data integration.
export default function ReceptionistAccessEntry({ page = 'today', role = 'receptionist' }) {
  const { t, i18n } = useTranslation('auth')
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = todayCopy[language]
  const [status, setStatus] = useState('loading')
  const [name, setName] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      try {
        const access = await authApi.getAccess({ signal: controller.signal })
        controller.signal.throwIfAborted()
        if (access.authenticated && access.role === role) {
          setName(access.displayName)
          setStatus('authorized')
        }
        else {
          const destination = accountDestination(access)
          if (destination) window.location.hash = destination.slice(1)
          else setStatus('unavailable')
        }
      } catch { if (!controller.signal.aborted) setStatus('unavailable') }
    }
    void check()
    return () => controller.abort()
  }, [role])
  const title = role === 'receptionist' ? `${copy.workspace} — ${page === 'walkIn' ? walkInCopy[language].title : copy[page]}` : t(`workspace.${role}`)
  const unavailable = role !== 'receptionist' ? t('workspace.dataUnavailable')
    : page === 'payments' ? paymentUnavailable[language] : page === 'appointments' ? appointmentsCopy[language].production : page === 'orders' ? ordersCopy[language].production : page === 'walkIn' ? walkInCopy[language].productionUnavailable : page === 'patients' ? patientsCopy[language].unavailable : copy.unavailable
  return <main className="r01-access" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-busy={status === 'loading'}>
    <header className="r01-access-header">
      <WorkspaceRoleLabel role={role} language={language} />
      <LanguageSwitcher />
      {status === 'authorized' && <WorkspaceAccountMenu name={name} language={language} live />}
    </header>
    <h1>{title}</h1>
    {status === 'loading' ? <p role="status">{t('actions.loading')}</p> : <>
      <p role="alert">{status === 'authorized' ? unavailable : t('errors.accessUnavailable')}</p>
      {status !== 'authorized' && <a href="#/login">{copy.login}</a>}
    </>}
  </main>
}
