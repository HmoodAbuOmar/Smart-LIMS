import { useEffect, useMemo, useRef, useState } from 'react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { ChevronDown, LogOut } from 'lucide-react'
import BrandLogo from '../../components/BrandLogo.jsx'
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx'
import { adminNavigation } from '../adminNavigation.js'

function AdminNavGroup({ item, copy, activeId, onNavigate }) {
  const { id, Icon, children } = item
  const childActive = children.some(child => child.id === activeId)
  const [disclosure, setDisclosure] = useState({ activeId, expanded: childActive })
  const toggle = useRef(null)
  // Adjust only when selection changes; a manual collapse remains possible.
  const expanded = disclosure.activeId === activeId ? disclosure.expanded : childActive || disclosure.expanded
  if (disclosure.activeId !== activeId) setDisclosure({ activeId, expanded })

  function setExpanded(open) {
    setDisclosure({ activeId, expanded: open })
  }

  return (
    <div className="admin-nav-group" onKeyDown={event => {
      if (event.key === 'Escape' && expanded) {
        event.stopPropagation()
        setExpanded(false)
        toggle.current?.focus()
      }
    }}>
      <button ref={toggle} id={`admin-group-${id}`} type="button"
        className={'admin-nav-item admin-nav-group-toggle' + (childActive ? ' has-active-child' : '')}
        aria-expanded={expanded} aria-controls={`admin-submenu-${id}`} onClick={() => setExpanded(!expanded)}>
        <Icon size={18} aria-hidden="true" />
        <span>{copy.items[id]}</span>
        <ChevronDown className="admin-nav-chevron" size={16} aria-hidden="true" />
      </button>
      <ul id={`admin-submenu-${id}`} className="admin-submenu" hidden={!expanded} aria-labelledby={`admin-group-${id}`}>
        {children.map(({ id: childId, Icon: ChildIcon }) => (
          <li key={childId}>
            <button type="button" className={'admin-nav-item admin-nav-child' + (activeId === childId ? ' is-active' : '')}
              aria-current={activeId === childId ? 'true' : undefined} onClick={() => onNavigate(childId)}>
              <ChildIcon size={18} aria-hidden="true" />
              <span>{copy.items[childId]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AdminSidebar({ copy, activeId, onNavigate, mobileOpen, language, onToggleLanguage }) {
  // Reuse the Portal control while preserving the independent Admin preference.
  const languageControl = useMemo(() => {
    const instance = createInstance()
    void instance.init({
      lng: language, fallbackLng: 'en', defaultNS: 'common', initAsync: false,
      resources: { en: { common: { language: 'Language' } }, ar: { common: { language: 'اللغة' } } },
    })
    return instance
  }, [language])

  useEffect(() => {
    const updateLanguage = next => { if (next !== language) onToggleLanguage() }
    languageControl.on('languageChanged', updateLanguage)
    return () => languageControl.off('languageChanged', updateLanguage)
  }, [languageControl, language, onToggleLanguage])

  return (
    <aside id="admin-navigation" className="admin-sidebar" data-open={mobileOpen} aria-label={copy.navigation}>
      <div className="admin-brand">
        <BrandLogo className="admin-logo" />
      </div>
      <nav aria-label={copy.navigation} className="admin-navigation">
        {adminNavigation.map(item => {
          const { id, Icon } = item
          if (item.children) return <AdminNavGroup key={id} item={item} copy={copy} activeId={activeId} onNavigate={onNavigate} />
          return (
          <button key={id} type="button" className={'admin-nav-item' + (activeId === id ? ' is-active' : '')}
            aria-current={activeId === id ? 'true' : undefined} onClick={() => onNavigate(id)}>
            <Icon size={18} aria-hidden="true" />
            <span>{copy.items[id]}</span>
          </button>
          )
        })}
      </nav>
      <div className="admin-sidebar-footer">
        <button type="button" className="admin-nav-item admin-logout" disabled>
          <LogOut size={19} strokeWidth={1.7} aria-hidden="true" /><span>{copy.logout}</span>
        </button>
        <div className="admin-language-control"><I18nextProvider i18n={languageControl}><LanguageSwitcher /></I18nextProvider></div>
      </div>
    </aside>
  )
}
