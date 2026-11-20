import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, X } from 'lucide-react'
import ReceptionistSidebar from './ReceptionistSidebar.jsx'
import { todayCopy } from '../today/todayCopy.js'
import '../receptionistLayout.css'

export default function ReceptionistLayout({ page = 'today', children }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = todayCopy[language]
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButton = useRef(null)
  useEffect(() => {
    const previous = document.title
    document.title = `Smart-LIMS | ${copy.workspace} — ${copy[page]}`
    return () => { document.title = previous }
  }, [copy, page])
  function closeMenu() { setMobileOpen(false); menuButton.current?.focus() }
  function navigate(id) {
    closeMenu()
    const base = window.location.hash.startsWith('#/__receptionist') ? '/__receptionist' : '/receptionist'
    window.location.hash = `${base}/${id}`
  }
  return <div className="reception-today-layout" data-reception-page={page} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} onKeyDown={event => { if (event.key === 'Escape' && mobileOpen) closeMenu() }}>
    <a className="r01-skip" href="#r01-content">{copy.skip}</a>
    <header className="r01-header"><button type="button" ref={menuButton} className="r01-menu-button" aria-expanded={mobileOpen} aria-controls="r01-navigation" aria-label={mobileOpen ? copy.closeMenu : copy.openMenu} onClick={() => setMobileOpen(current => !current)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button><strong>{copy.workspace}</strong></header>
    <ReceptionistSidebar copy={copy} activePage={page} menuOpen={mobileOpen} onSelect={navigate} />
    <main className="r01-main" id="r01-content" tabIndex={-1} aria-label={copy.content}>{children}</main>
  </div>
}
