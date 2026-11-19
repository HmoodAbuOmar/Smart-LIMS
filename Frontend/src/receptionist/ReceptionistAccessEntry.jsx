import { appointmentsCopy } from './appointments/appointmentsCopy.js'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { todayCopy } from './today/todayCopy.js'
import { patientsCopy } from './patients/patientsCopy.js'
import { walkInCopy } from './walk-in/walkInCopy.js'
import { ordersCopy } from './orders/ordersCopy.js'
import './today/today.css'

const paymentUnavailable = {
  en: 'Staff payment services are unavailable.',
  ar: 'خدمات الدفع للموظفين غير متاحة.',
}

// No staff access/session contract or staff appointment list is configured.
// Fail closed: this route never imports records or the development workspace.
export default function ReceptionistAccessEntry({ page = 'today', unavailable }) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const copy = todayCopy[language]
  return <main className="r01-access" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}><LanguageSwitcher /><h1>{copy.workspace} — {page === 'walkIn' ? walkInCopy[language].title : copy[page]}</h1><p role="alert">{unavailable?.[language] || (page === 'payments' ? paymentUnavailable[language] : page === 'appointments' ? appointmentsCopy[language].production : page === 'orders' ? ordersCopy[language].production : page === 'walkIn' ? walkInCopy[language].productionUnavailable : page === 'patients' ? patientsCopy[language].unavailable : copy.unavailable)}</p><a href="#/login">{copy.login}</a></main>
}
