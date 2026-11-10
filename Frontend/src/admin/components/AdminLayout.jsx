import { useCallback, useEffect, useRef, useState } from 'react'
import AdminSidebar from './AdminSidebar.jsx'
import AdminNavbar from './AdminNavbar.jsx'
import AdminOverview from './AdminOverview.jsx'
import AdminUsers from './AdminUsers.jsx'
import AdminPatients from '../patients/AdminPatients.jsx'
import AdminTestCatalog from '../catalog/AdminTestCatalog.jsx'
import AdminBookingSlots from '../bookingSlots/AdminBookingSlots.jsx'
import AdminReports from '../reports/AdminReports.jsx'
import AdminAuditLog from '../auditLog/AdminAuditLog.jsx'
import AdminOperationsPayments from '../operationsPayments/AdminOperationsPayments.jsx'
import { adminCopy } from '../adminCopy.js'

const languageKey = 'smart-lims.admin.language'
function initialLanguage() {
  try { return localStorage.getItem(languageKey) === 'ar' ? 'ar' : 'en' }
  catch { return 'en' }
}

export default function AdminLayout({ initialPage = 'overview', developmentPreview = false }) {
  const [language, setLanguage] = useState(initialLanguage)
  const [activeId, setActiveId] = useState(initialPage)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButton = useRef(null)
  const catalogGuard = useRef(null)
  const registerCatalogGuard = useCallback(guard => { catalogGuard.current = guard }, [])
  const copy = adminCopy[language]
  const direction = language === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    try { localStorage.setItem(languageKey, language) }
    catch { /* Switching languages still works when storage is blocked. */ }
  }, [language])

  useEffect(() => {
    const root = document.documentElement
    const previous = { lang: root.lang, dir: root.dir, title: document.title }
    root.lang = language
    root.dir = direction
    document.title = 'Smart-LIMS | ' + (['patients', 'tests', 'parameters', 'referenceRanges', 'bookingSlots', 'operationsPayments', 'auditLog', 'reports'].includes(activeId) ? copy.items[activeId] : copy.title)
    return () => {
      root.lang = previous.lang
      root.dir = previous.dir
      document.title = previous.title
    }
  }, [language, direction, copy.title, copy.items, activeId])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 901px)')
    function resetMobileMenu() { if (media.matches) setMobileOpen(false) }
    media.addEventListener('change', resetMobileMenu)
    return () => media.removeEventListener('change', resetMobileMenu)
  }, [])

  function closeMenu() {
    setMobileOpen(false)
    menuButton.current?.focus()
  }
  function navigate(id, checked = false) {
    if (!checked && catalogGuard.current) { catalogGuard.current(() => navigate(id, true)); return }
    // Preserve the existing selection flow; no API or new page routes are invented.
    setActiveId(id)
    if (mobileOpen) closeMenu()
  }

  return (
    <div className="admin-layout" lang={language} dir={direction} data-admin-development-preview={developmentPreview || undefined} onKeyDown={event => {
      if (event.key === 'Escape' && mobileOpen) closeMenu()
    }}>
      <a className="admin-skip-link" href="#admin-main">{copy.skip}</a>
      <AdminNavbar copy={copy} activeId={activeId} mobileOpen={mobileOpen} menuButtonRef={menuButton}
        onToggleMenu={() => setMobileOpen(open => !open)} />
      <AdminSidebar copy={copy} activeId={activeId} onNavigate={navigate} mobileOpen={mobileOpen} language={language}
        onToggleLanguage={() => setLanguage(current => current === 'en' ? 'ar' : 'en')} />
      <main id="admin-main" className={`admin-main${activeId === 'users' ? ' admin-main-users' : ''}`} aria-label={copy.content} tabIndex={-1}>
        {activeId === 'overview' && <AdminOverview language={language} />}
        {activeId === 'users' && <AdminUsers language={language} />}
        {activeId === 'reports' && <AdminReports language={language} />}
        {activeId === 'auditLog' && <AdminAuditLog language={language} />}
        {activeId === 'operationsPayments' && <AdminOperationsPayments language={language} />}
        {activeId === 'bookingSlots' && <AdminBookingSlots language={language} />}
        {activeId === 'patients' && <AdminPatients language={language} onToggleLanguage={() => setLanguage(current => current === 'en' ? 'ar' : 'en')} />}
        {['tests', 'parameters', 'referenceRanges'].includes(activeId) && <AdminTestCatalog language={language} activePage={activeId} registerNavigationGuard={registerCatalogGuard} onNavigate={id => navigate(id, true)} onToggleLanguage={() => setLanguage(current => current === 'en' ? 'ar' : 'en')} />}
      </main>
    </div>
  )
}
