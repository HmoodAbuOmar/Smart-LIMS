import { useTranslation } from 'react-i18next'
import { ClipboardCheck, ClipboardClock, ClipboardList, FileCheck2, FlaskConical } from 'lucide-react'
import WorkspaceSidebar from '../components/WorkspaceSidebar.jsx'
import { logoutWithCookie } from '../auth/cookieSession.js'

const navigation = [
  { id: 'worklist', Icon: ClipboardList },
  { id: 'samples', Icon: FlaskConical },
  { id: 'drafts', Icon: ClipboardClock },
  { id: 'approved', Icon: ClipboardCheck },
  { id: 'published', Icon: FileCheck2 },
]
const classes = { sidebar: 'lab-sidebar', brand: 'lab-brand', logo: 'lab-logo', footer: 'lab-sidebar-footer', logout: 'lab-logout', error: 'lab-logout-error', language: 'lab-language' }

export default function LabTechnicianSidebar({ copy, menuOpen, onSelect }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const items = navigation.map(item => ({ ...item, label: copy[item.id], dataPage: item.id }))
  return <WorkspaceSidebar id="lab-navigation" prefix="lab" classes={classes} items={items} activeId="worklist" onNavigate={onSelect} mobileOpen={menuOpen} language={language} onLanguageChange={next => void i18n.changeLanguage(next)} navigationLabel={copy.navigation} logoutLabel={copy.logout} signingOutLabel={copy.signingOut} logoutError={copy.logoutError} logoutUnavailable={copy.logoutUnavailable} onLogoClick={() => onSelect('worklist')} onLogout={async () => { await logoutWithCookie(); window.location.hash = '/login' }} />
}
