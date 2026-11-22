import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authApi } from '../auth/api.js'
import { accountDestination } from '../auth/access.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import WorkspaceRoleLabel from '../components/WorkspaceRoleLabel.jsx'
import LabTechnicianLayout from './LabTechnicianLayout.jsx'
import LaboratoryWorklist from './LaboratoryWorklist.jsx'
import { worklistCopy } from './worklistCopy.js'
import './lab.css'

export default function LabTechnicianAccess() {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      try {
        const access = await authApi.getAccess({ signal: controller.signal })
        controller.signal.throwIfAborted()
        if (access.authenticated && access.role === 'lab_technician') setStatus('authorized')
        else {
          const destination = accountDestination(access)
          if (destination) window.location.hash = destination.slice(1)
          else setStatus('unavailable')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('unavailable')
      }
    }
    void check()
    return () => controller.abort()
  }, [])
  if (status === 'authorized') {
    return <LabTechnicianLayout><LaboratoryWorklist /></LabTechnicianLayout>
  }
  return <main className="lab-access" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-busy={status === 'loading'}>
    <header className="lab-access-header">
      <WorkspaceRoleLabel role="lab_technician" language={language} />
      <LanguageSwitcher />
    </header>
    <h1>{copy.title}</h1>
    {status === 'loading' ? <p role="status">{copy.accessLoading}</p> : <>
      <p role="alert">{copy.accessUnavailable}</p>
      <a href="#/login">{copy.login}</a>
    </>}
  </main>
}
