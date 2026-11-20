import WorkspaceSidebar from '../../components/WorkspaceSidebar.jsx'
import { requestServiceOperation } from '../../services/serviceTransport.js'
import { authApi } from '../../auth/api.js'
import { adminNavigation } from '../adminNavigation.js'

const classes = { sidebar:'admin-sidebar', brand:'admin-brand', logo:'admin-logo', navigation:'admin-navigation', item:'admin-nav-item', group:'admin-nav-group', groupToggle:'admin-nav-group-toggle', child:'admin-nav-child', chevron:'admin-nav-chevron', submenu:'admin-submenu', footer:'admin-sidebar-footer', logout:'admin-logout', language:'admin-language-control' }
export default function AdminSidebar({ copy, activeId, onNavigate, mobileOpen, language, onToggleLanguage, live }) {
  const localize = item => ({ ...item, dataPage: item.id, label:copy.items[item.id], ...(item.children ? {children:item.children.map(localize)} : {}) })
  return <WorkspaceSidebar id="admin-navigation" prefix="admin" classes={classes} items={adminNavigation.map(localize)} activeId={activeId} onNavigate={onNavigate} mobileOpen={mobileOpen} language={language} onLanguageChange={next => { if(next!==language)onToggleLanguage() }} navigationLabel={copy.navigation} logoutLabel={copy.logout} logoutUnavailable={live ? undefined : copy.logoutUnavailable} currentValue="true" onLogout={async()=>{await (live ? authApi.logout() : requestServiceOperation('previewLogout'));window.location.hash='/login'}} />
}
