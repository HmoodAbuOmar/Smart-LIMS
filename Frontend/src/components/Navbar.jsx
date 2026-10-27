import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ChevronRight, Menu, X } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import './Navbar.css'

// Ordered by the existing landing-page sections. The CTA keeps its signup action.
const links = [
  ['home', 'home'],
  ['how-it-works', 'howItWorks'],
  ['features', 'userRoles'],
  ['platform-preview', 'showcase'],
  ['insights', 'insights'],
  ['security', 'security'],
  ['vision', 'vision'],
]

export default function Navbar({ logo, onOpenAuth }) {
  const { t } = useTranslation('common')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('home')
  const headerRef = useRef(null)
  const toggleRef = useRef(null)

  useEffect(() => {
    const header = headerRef.current
    let frame = 0
    function updateActive() {
      frame = 0
      const threshold = header.getBoundingClientRect().height + 48
      let current = 'home'
      for (const [id] of links) {
        if (document.getElementById(id)?.getBoundingClientRect().top <= threshold) current = id
      }
      setActiveSection(current)
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(updateActive)
    }
    function onResize() {
      document.documentElement.style.setProperty('--navbar-height', `${header.getBoundingClientRect().height}px`)
      // Do not retain a hidden mobile menu when returning to desktop.
      if (window.matchMedia('(min-width: 1200px)').matches) setMenuOpen(false)
      onScroll()
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(header)
    window.addEventListener('scroll', onScroll, { passive: true })
    onResize()
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      document.documentElement.style.removeProperty('--navbar-height')
    }
  }, [])

  function openAuth(mode) {
    setMenuOpen(false)
    onOpenAuth(mode)
  }

  return <header className="site-header" ref={headerRef} onKeyDown={event => {
    if (event.key === 'Escape' && menuOpen) {
      setMenuOpen(false)
      toggleRef.current?.focus()
    }
  }}>
    <div className="container nav-inner">
      {logo}
      <nav id="landing-navigation" className={menuOpen ? 'navigation is-open' : 'navigation'} aria-label={t('mainNavigation')}>
        {links.map(([id, key]) => <a
          key={id}
          href={`#${id}`}
          aria-current={activeSection === id ? 'location' : undefined}
          onClick={() => setMenuOpen(false)}
        >{t(`navigation.${key}`)}</a>)}
        <button type="button" className="mobile-contact auth-nav-button" onClick={() => openAuth('login')}>{t('login')}</button>
      </nav>
      <div className="nav-actions">
        <LanguageSwitcher />
        <button type="button" className="login-link auth-nav-button" onClick={() => openAuth('login')}>{t('login')}<ChevronRight size={14} /></button>
        <button className="button button-primary nav-cta" onClick={() => openAuth('signup')}>{t('getStarted')}<ArrowRight size={15} /></button>
      </div>
      <button ref={toggleRef} type="button" className="menu-toggle" aria-label={menuOpen ? t('closeMenu') : t('openMenu')} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <X /> : <Menu />}
      </button>
    </div>
  </header>
}
