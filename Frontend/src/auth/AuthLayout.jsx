import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import '../components/AuthModal.css'

export default function AuthLayout({ mode = 'login', children }) {
  const { t, i18n } = useTranslation(['auth', 'common'])
  const cardRef = useRef(null)
  useLayoutEffect(() => {
    const card = cardRef.current
    const heading = card.querySelector('#auth-heading')
    const tools = card.querySelector('.auth-brand-tools')
    const logo = card.querySelector('.auth-logo')
    if (!heading) return
    let disposed = false
    const alignLogo = () => {
      if (disposed) return
      // Visible artwork starts at row 88 in the unchanged 1774px-wide PNG.
      const transparentInset = logo.getBoundingClientRect().width * 88 / 1774
      const offset = heading.getBoundingClientRect().top - tools.getBoundingClientRect().top - transparentInset
      card.style.setProperty('--auth-logo-heading-offset', `${offset}px`)
    }
    const observer = new ResizeObserver(alignLogo)
    for (const element of [card, heading, tools]) observer.observe(element)
    logo.addEventListener('load', alignLogo)
    void document.fonts.ready.then(alignLogo)
    alignLogo()
    return () => { disposed = true; observer.disconnect(); logo.removeEventListener('load', alignLogo) }
  }, [children, i18n.resolvedLanguage])
  return <div className="patient-auth">
    <a className="auth-skip" href="#auth-content" onClick={event => { event.preventDefault(); document.getElementById('auth-heading')?.focus() }}>{t('auth:page.skip')}</a>
    <main id="auth-content" className="auth-content">
      <div className="auth-card" ref={cardRef}>
        <div className="auth-layout">
          <aside className="auth-branding">
            <div className="auth-light-ribbons" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
            </div>
            <div className="auth-brand-tools">
              <a href="#home" className="auth-logo-link" aria-label={t('common:homeLabel')}><BrandLogo alt="SmartLIMS" className="auth-logo" /></a>
            </div>
            <div className="auth-brand-copy">
              <span className="auth-brand-rule" aria-hidden="true" /><p>{t('auth:page.infoHeading')}</p>
            </div>
            <LanguageSwitcher />
          </aside>

          <section className="auth-form-panel" aria-labelledby="auth-heading">
            {children}
          </section>
        </div>
            <nav className="auth-tabs" aria-label={t('common:mainNavigation')} data-mode={mode}>
              <a href="#/login" aria-current={mode === 'login' ? 'page' : undefined}>{t('auth:tabs.login')}</a>
              <a href="#/signup" aria-current={mode === 'signup' ? 'page' : undefined}>{t('auth:tabs.signup')}</a>
            </nav>
      </div>
    </main>
  </div>
}
