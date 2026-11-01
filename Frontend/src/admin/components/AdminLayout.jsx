import { useEffect, useRef, useState } from 'react'
import AdminSidebar from './AdminSidebar.jsx'
import AdminNavbar from './AdminNavbar.jsx'
import AdminOverview from './AdminOverview.jsx'
import { adminCopy } from '../adminCopy.js'

const languageKey = 'smart-lims.admin.language'
function initialLanguage() {
  try { return localStorage.getItem(languageKey) === 'ar' ? 'ar' : 'en' }
  catch { return 'en' }
}

export default function AdminLayout() {
  const [language, setLanguage] = useState(initialLanguage)
  const [activeId, setActiveId] = useState('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButton = useRef(null)
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
    document.title = 'Smart-LIMS | ' + copy.title
    return () => {
      root.lang = previous.lang
      root.dir = previous.dir
      document.title = previous.title
    }
  }, [language, direction, copy.title])

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
  function navigate(id) {
    // Preserve the existing selection flow; no API or new page routes are invented.
    setActiveId(id)
    if (mobileOpen) closeMenu()
  }

  return (
    <div className="admin-layout" lang={language} dir={direction} onKeyDown={event => {
      if (event.key === 'Escape' && mobileOpen) closeMenu()
    }}>
      <a className="admin-skip-link" href="#admin-main">{copy.skip}</a>
      <AdminNavbar copy={copy} activeId={activeId} language={language} mobileOpen={mobileOpen} menuButtonRef={menuButton}
        onToggleMenu={() => setMobileOpen(open => !open)}
        onToggleLanguage={() => setLanguage(current => current === 'en' ? 'ar' : 'en')} />
      <AdminSidebar copy={copy} activeId={activeId} onNavigate={navigate} mobileOpen={mobileOpen} />
      <main id="admin-main" className="admin-main" aria-label={copy.content} tabIndex={-1}>
        {activeId === 'overview' && <AdminOverview language={language} />}
      </main>
    </div>
  )
}
