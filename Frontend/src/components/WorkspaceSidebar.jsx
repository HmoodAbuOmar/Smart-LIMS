import { useEffect, useMemo, useRef, useState } from 'react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { ChevronDown, LogOut } from 'lucide-react'
import BrandLogo from './BrandLogo.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import './WorkspaceSidebar.css'

const labels = {
  en: { language: 'Language', signingOut: 'Signing out…', error: 'Could not sign out. Please try again.', unavailable: 'Sign-out services are not configured.' },
  ar: { language: 'اللغة', signingOut: 'جارٍ تسجيل الخروج…', error: 'تعذّر تسجيل الخروج. يُرجى إعادة المحاولة.', unavailable: 'لم تُهيّأ خدمة تسجيل الخروج.' },
}
function NavigationGroup({ item, activeId, onNavigate, prefix, classes, currentValue }) {
  const childActive = item.children.some(child => child.id === activeId)
  const [disclosure, setDisclosure] = useState({ activeId, expanded: childActive })
  const toggle = useRef(null)
  const expanded = disclosure.activeId === activeId ? disclosure.expanded : childActive || disclosure.expanded
  if (disclosure.activeId !== activeId) setDisclosure({ activeId, expanded })
  const Icon = item.Icon
  return <div className={`ws-group ${classes.group || ''}`} onKeyDown={event => {
    if (event.key === 'Escape' && expanded) { event.stopPropagation(); setDisclosure({ activeId, expanded: false }); toggle.current?.focus() }
  }}>
    <button ref={toggle} type="button" id={`${prefix}-group-${item.id}`} className={`ws-item ws-group-toggle ${classes.item || ''} ${classes.groupToggle || ''}${childActive ? ' has-active-child' : ''}`} aria-expanded={expanded} aria-controls={`${prefix}-submenu-${item.id}`} onClick={() => setDisclosure({ activeId, expanded: !expanded })}>
      <Icon size={18} aria-hidden="true" /><span>{item.label}</span><ChevronDown size={16} className={`ws-chevron ${classes.chevron || ''}`} aria-hidden="true" />
    </button>
    <ul id={`${prefix}-submenu-${item.id}`} className={`ws-submenu ${classes.submenu || ''}`} hidden={!expanded} aria-labelledby={`${prefix}-group-${item.id}`}>
      {item.children.map(child => <li key={child.id}><NavigationItem item={child} activeId={activeId} onNavigate={onNavigate} classes={classes} currentValue={currentValue} child /></li>)}
    </ul>
  </div>
}
function NavigationItem({ item, activeId, onNavigate, classes, currentValue, child = false }) {
  const Icon = item.Icon
  return <button type="button" data-page={item.dataPage} className={`ws-item ${classes.item || ''}${child ? ` ws-child ${classes.child || ''}` : ''}${activeId === item.id ? ' is-active' : ''}`} aria-current={activeId === item.id ? currentValue : undefined} disabled={item.disabled} aria-describedby={item.describedBy} title={item.title} onClick={() => onNavigate(item.id)}>
    <Icon size={18} aria-hidden="true" /><span>{item.label}</span>{item.badge != null && <small>{item.badge}</small>}
  </button>
}

// Role layouts supply their existing items and callbacks. No role, route or
// authentication decision belongs in this presentation component.
export default function WorkspaceSidebar({ id, prefix, items, activeId, onNavigate, mobileOpen, language, onLanguageChange, navigationLabel, logoutLabel, onLogout, logoutUnavailable, signingOutLabel, logoutError, classes = {}, currentValue = 'page', onLogoClick, children }) {
  const copy = labels[language]
  const control = useMemo(() => {
    const instance = createInstance()
    void instance.init({ lng: language, fallbackLng: 'en', defaultNS: 'common', initAsync: false, resources: { en: { common: { language: labels.en.language } }, ar: { common: { language: labels.ar.language } } } })
    return instance
  }, [language])
  useEffect(() => {
    const update = next => { if (next !== language) onLanguageChange(next) }
    control.on('languageChanged', update)
    return () => control.off('languageChanged', update)
  }, [control, language, onLanguageChange])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const lock = useRef(false)
  async function signOut() {
    if (lock.current || !onLogout) return
    lock.current = true; setPending(true); setError(null)
    try { await onLogout() }
    catch (failure) { setError(failure?.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : 'error') }
    finally { lock.current = false; setPending(false) }
  }
  const logo = <BrandLogo className={`ws-logo ${classes.logo || ''}`} />
  return <aside id={id} className={`workspace-sidebar ${classes.sidebar || ''}`} data-open={mobileOpen} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} aria-label={navigationLabel}>
    {onLogoClick ? <button type="button" className={`ws-brand ${classes.brand || ''}`} aria-label="Smart-LIMS" onClick={onLogoClick}>{logo}</button> : <div className={`ws-brand ${classes.brand || ''}`}>{logo}</div>}
    <nav className={`ws-nav ${classes.navigation || ''}`} aria-label={navigationLabel}>{items.map(item => item.children ? <NavigationGroup key={item.id} item={item} activeId={activeId} onNavigate={onNavigate} prefix={prefix} classes={classes} currentValue={currentValue} /> : <NavigationItem key={item.id} item={item} activeId={activeId} onNavigate={onNavigate} classes={classes} currentValue={currentValue} />)}</nav>
    {children}
    <div className={`ws-footer ${classes.footer || ''}`}>
      <button type="button" className={`ws-item ws-logout ${classes.logout || ''}`} disabled={pending || !onLogout} aria-busy={pending} title={!onLogout ? logoutUnavailable || copy.unavailable : undefined} onClick={() => void signOut()}><LogOut size={19} strokeWidth={1.7} aria-hidden="true" /><span>{pending ? signingOutLabel || copy.signingOut : logoutLabel}</span></button>
      {error && <p className={`ws-logout-error ${classes.error || ''}`} role="alert">{error === 'unavailable' ? logoutUnavailable || copy.unavailable : logoutError || copy.error}</p>}
      <div className={`ws-language ${classes.language || ''}`}><I18nextProvider i18n={control}><LanguageSwitcher /></I18nextProvider></div>
    </div>
  </aside>
}
