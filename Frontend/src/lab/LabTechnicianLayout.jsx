import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, Menu, X } from 'lucide-react'
import LabTechnicianSidebar from './LabTechnicianSidebar.jsx'
import WorkspaceRoleLabel from '../components/WorkspaceRoleLabel.jsx'
import WorkspaceAccountMenu from '../components/WorkspaceAccountMenu.jsx'
import { worklistCopy } from './worklistCopy.js'
import './lab.css'

const NoticeContext = createContext(null)

export function useLabNotice() {
  return useContext(NoticeContext)
}

export default function LabTechnicianLayout({ page = 'worklist', children, onSelectPage, documentTitle, contentLabel: contentLabelOverride }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = worklistCopy[language]
  const pageTitle = documentTitle || (page === 'samples' ? copy.sampleTitle : copy.title)
  const contentLabel = contentLabelOverride || (page === 'samples' ? copy.sampleContent : copy.content)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notice, setNotice] = useState(null)
  const menuButton = useRef(null)
  useEffect(() => {
    const previous = document.title
    document.title = `Smart-LIMS | ${pageTitle}`
    return () => { document.title = previous }
  }, [pageTitle])
  function closeMenu() {
    setMobileOpen(false)
    menuButton.current?.focus()
  }
  function select(id) {
    closeMenu()
    onSelectPage?.(id)
    const preview = window.location.hash.startsWith('#/__lab')
    const base = preview ? '/__lab' : '/lab-technician'
    if (id === 'worklist' || id === 'samples') {
      setNotice(null)
      window.location.hash = id === 'samples' ? `${base}/samples` : base
      return
    }
    setNotice(id)
  }
  return <NoticeContext.Provider value={setNotice}>
    <div className="lab-layout" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} onKeyDown={event => { if (event.key === 'Escape' && mobileOpen) closeMenu() }}>
      <a className="lab-skip" href="#lab-content">{copy.skip}</a>
      <header className="lab-header">
        <button type="button" ref={menuButton} className="lab-menu" aria-expanded={mobileOpen} aria-controls="lab-navigation" aria-label={mobileOpen ? copy.closeMenu : copy.openMenu} onClick={() => setMobileOpen(current => !current)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <WorkspaceRoleLabel role="lab_technician" language={language} />
        <button type="button" className="lab-bell" aria-label={copy.notifications} onClick={() => setNotice('notifications')}><Bell size={20} aria-hidden="true" /></button>
        <WorkspaceAccountMenu name={copy.accountLabel} language={language} live />
      </header>
      <LabTechnicianSidebar copy={copy} page={page} menuOpen={mobileOpen} onSelect={select} />
      <main className="lab-main" id="lab-content" tabIndex={-1} aria-label={contentLabel}>
        {notice && copy.missing[notice] && <p className="lab-notice" role="status">{copy.missing[notice]} <button type="button" onClick={() => setNotice(null)}>{copy.dismiss}</button></p>}
        {children}
      </main>
    </div>
  </NoticeContext.Provider>
}
