import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import enLanding from './locales/en/landing.json'
import arCommon from './locales/ar/common.json'
import arLanding from './locales/ar/landing.json'
import enAuth from './locales/en/auth.json'
import arAuth from './locales/ar/auth.json'
import enShowcase from './locales/en/showcase.json'
import arShowcase from './locales/ar/showcase.json'
import { portalResources } from './portal/portalCopy.js'

export const LANGUAGE_STORAGE_KEY = 'smart-lims.language'
export const supportedLanguages = ['en', 'ar']

function savedLanguage() {
  try {
    const language = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return supportedLanguages.includes(language) ? language : 'en'
  } catch {
    // Private browsing and blocked storage still allow switching in memory.
    return 'en'
  }
}

function syncLanguage(language) {
  const resolved = supportedLanguages.includes(language) ? language : 'en'
  document.documentElement.lang = resolved
  document.documentElement.dir = i18n.dir(resolved)
  document.title = 'Smart-LIMS | Laboratory Platform'
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content', i18n.t('landing:meta.description', { lng: resolved }),
  )
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, resolved)
  } catch {
    // Storage availability must not prevent a language change.
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, landing: enLanding, auth: enAuth, showcase: enShowcase, portal: portalResources.en },
    ar: { common: arCommon, landing: arLanding, auth: arAuth, showcase: arShowcase, portal: portalResources.ar },
  },
  lng: savedLanguage(),
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  ns: ['common', 'landing', 'auth', 'showcase', 'portal'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  // Bundled resources are available before the first React render.
  initAsync: false,
})

syncLanguage(i18n.resolvedLanguage)
i18n.on('languageChanged', syncLanguage)

export default i18n
