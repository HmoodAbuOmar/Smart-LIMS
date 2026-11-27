import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { authApi } from '../auth/api.js'
import { accountDestination } from '../auth/access.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import WorkspaceRoleLabel from '../components/WorkspaceRoleLabel.jsx'
import WorkspaceAccountMenu from '../components/WorkspaceAccountMenu.jsx'
import ReceptionistAppointments from './appointments/ReceptionistAppointments.jsx'
import ReceptionistLayout from './components/ReceptionistLayout.jsx'
import ReceptionistOrders from './orders/ReceptionistOrders.jsx'
import ReceptionistPatients from './patients/ReceptionistPatients.jsx'
import ReceptionistPayments from './payments/ReceptionistPayments.jsx'
import ReceptionistToday from './today/ReceptionistToday.jsx'
import { todayCopy } from './today/todayCopy.js'
import ReceptionistWalkIn from './walk-in/ReceptionistWalkIn.jsx'
import { liveAppointments, livePatients, liveToday, liveWalkIn } from './receptionistLiveApi.js'
import './today/today.css'

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
  if (status === 'authorized' && role === 'receptionist') {
    const query = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const patientId = query.get('patientId') || null
    const fromPatients = !!patientId && query.get('from') === 'patients'
    const bookingContext = query.get('purpose') === 'scheduled' ? { date: query.get('bookingDate') } : null
    const navPage = page === 'walkIn' ? bookingContext ? 'appointments' : fromPatients ? 'patients' : 'today' : page
    const hash = window.location.hash
    return <ReceptionistLayout page={navPage} live name={name}>
      {page === 'payments' ? <ReceptionistPayments key={hash} service={liveWalkIn} />
        : page === 'appointments' ? <ReceptionistAppointments key={hash} service={liveAppointments} initialOrderId={query.get('orderId')} initialDate={query.get('date')} openBooking={query.get('book') === '1'} />
        : page === 'orders' ? <ReceptionistOrders key={hash} orderId={query.get('orderId')} service={liveWalkIn} />
        : page === 'walkIn' ? <ReceptionistWalkIn key={hash} service={liveWalkIn} patientsService={livePatients} initialPatientId={patientId} initialTab={fromPatients ? 'details' : 'orders'} fromPatients={fromPatients} bookingContext={bookingContext} />
        : page === 'patients' ? <ReceptionistPatients key={hash} service={livePatients} />
        : <ReceptionistToday key={hash} service={liveToday} />}
    </ReceptionistLayout>
  }
  const title = role === 'receptionist' ? `${copy.workspace} — ${copy[page] || page}` : t(`workspace.${role}`)
  return <main className="r01-access" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-busy={status === 'loading'}>
    <header className="r01-access-header">
      <WorkspaceRoleLabel role={role} language={language} />
      <LanguageSwitcher />
      {status === 'authorized' && <WorkspaceAccountMenu name={name} language={language} live />}
    </header>
    <h1>{title}</h1>
    {status === 'loading' ? <p role="status">{t('actions.loading')}</p> : <>
      <p role="alert">{t('errors.accessUnavailable')}</p>
      <a href="#/login">{copy.login}</a>
    </>}
  </main>
}
