import { useTranslation } from 'react-i18next'
import { CalendarCheck, Users, ClipboardList, CalendarDays, CreditCard } from 'lucide-react'
import WorkspaceSidebar from '../../components/WorkspaceSidebar.jsx'
import { receptionistSession } from '../receptionistSession.js'

const navigation = [{id:'today',Icon:CalendarCheck},{id:'patients',Icon:Users},{id:'orders',Icon:ClipboardList},{id:'appointments',Icon:CalendarDays},{id:'payments',Icon:CreditCard}]
const classes = {sidebar:'r01-sidebar',brand:'r01-brand',logo:'r01-logo',footer:'r01-sidebar-footer',logout:'r01-logout',error:'r01-logout-error',language:'r01-language-control'}
export default function ReceptionistSidebar({ copy, menuOpen, onSelect }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const items = navigation.map(item=>({...item,label:copy[item.id],disabled:item.id!=='today',describedBy:item.id!=='today'?'r01-navigation-unavailable':undefined}))
  return <WorkspaceSidebar id="r01-navigation" prefix="r01" classes={classes} items={items} activeId="today" onNavigate={onSelect} mobileOpen={menuOpen} language={language} onLanguageChange={next=>void i18n.changeLanguage(next)} navigationLabel={copy.navigation} logoutLabel={copy.logout} signingOutLabel={copy.signingOut} logoutError={copy.logoutError} logoutUnavailable={copy.logoutUnavailable} onLogoClick={onSelect} onLogout={async()=>{await receptionistSession.signOut();window.location.hash='/login'}}>
    <span className="r01-role-label r01-sr-only">{copy.workspace}</span><p id="r01-navigation-unavailable" className="r01-sr-only">{copy.navigationUnavailable}</p>
  </WorkspaceSidebar>
}
