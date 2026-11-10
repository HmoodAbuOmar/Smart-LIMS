import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx'
import { todayCopy } from './todayCopy.js'
import './today.css'

// No staff access/session contract or staff appointment list is configured.
// Fail closed: this route never imports records or the development workspace.
export default function ReceptionistEntry() {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = todayCopy[language]
  return <main className="r01-access" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}><LanguageSwitcher /><h1>{copy.workspace} — {copy.today}</h1><p role="alert">{copy.unavailable}</p><a href="#/login">{copy.login}</a></main>
}
