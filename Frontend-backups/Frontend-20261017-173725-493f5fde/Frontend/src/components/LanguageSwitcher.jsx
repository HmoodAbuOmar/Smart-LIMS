import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Globe } from 'lucide-react'

const languages = [{ code: 'ar', label: 'العربية' }, { code: 'en', label: 'English' }]

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
  const focusIndex = useRef(0)
  const menuId = useId()
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'

  useEffect(() => {
    if (!open) return
    optionRefs.current[focusIndex.current]?.focus()
    function outside(event) {
      if (!rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function closeAndFocus() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function openAt(index) {
    focusIndex.current = index
    setOpen(true)
  }

  return <div className="language-switcher" ref={rootRef} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      closeAndFocus()
    }
  }}>
    <button
      ref={triggerRef}
      type="button"
      className="language-switcher__trigger"
      aria-label={`${t('language')}: ${language === 'ar' ? 'العربية' : 'English'}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={() => open ? setOpen(false) : openAt(languages.findIndex(item => item.code === language))}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          openAt(event.key === 'ArrowUp' ? languages.length - 1 : 0)
        }
      }}
    >
      <Globe size={15} aria-hidden="true" />
      <span className="language-switcher__label" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <span>{language === 'ar' ? 'ع' : 'EN'}</span>
      </span>
      <ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <div id={menuId} role="menu" aria-label={t('language')} className="language-switcher__menu" onKeyDown={event => {
      const current = optionRefs.current.indexOf(document.activeElement)
      let next
      if (event.key === 'ArrowDown') next = (current + 1) % languages.length
      if (event.key === 'ArrowUp') next = (current - 1 + languages.length) % languages.length
      if (event.key === 'Home') next = 0
      if (event.key === 'End') next = languages.length - 1
      if (next !== undefined) {
        event.preventDefault()
        optionRefs.current[next]?.focus()
      }
      if (event.key === 'Tab') closeAndFocus()
    }}>
      {languages.map(({ code, label }, index) => <button
        key={code}
        ref={element => { optionRefs.current[index] = element }}
        className="language-switcher__option"
        type="button"
        role="menuitemradio"
        aria-checked={language === code}
        tabIndex={-1}
        onClick={() => {
          void i18n.changeLanguage(code)
          closeAndFocus()
        }}
      >
        <span lang={code} dir={code === 'ar' ? 'rtl' : 'ltr'}>{label}</span>
        {language === code && <Check size={14} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>
}
