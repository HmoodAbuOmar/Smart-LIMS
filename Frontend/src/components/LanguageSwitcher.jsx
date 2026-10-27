import { useTranslation } from 'react-i18next'
import './LanguageSwitcher.css'

const languages = [{ code: 'ar', label: 'عربي', name: 'العربية' }, { code: 'en', label: 'EN', name: 'English' }]

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common')
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'

  return <div className="language-switcher" role="group" aria-label={t('language')} dir="ltr">
    {languages.map(({ code, label, name }) => <button
      key={code}
      type="button"
      className="language-switcher__segment"
      lang={code}
      dir={code === 'ar' ? 'rtl' : 'ltr'}
      aria-label={name}
      aria-pressed={language === code}
      onClick={() => { if (language !== code) void i18n.changeLanguage(code) }}
    >{label}</button>)}
  </div>
}
