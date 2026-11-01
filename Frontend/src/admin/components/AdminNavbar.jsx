import { Bell, Languages, Menu, Search, UserRound, X } from 'lucide-react'
import '../adminNavbar.css'

export default function AdminNavbar({ copy, activeId, language, onToggleLanguage, mobileOpen, onToggleMenu, menuButtonRef }) {
  return (
    <header className="admin-header">
      <button ref={menuButtonRef} type="button" className="admin-menu-toggle" aria-controls="admin-navigation"
        aria-expanded={mobileOpen} aria-label={mobileOpen ? copy.closeMenu : copy.openMenu} onClick={onToggleMenu}>
        {mobileOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
      </button>

      <div className="admin-header-heading"><h1>{copy.title}</h1><span>{copy.items[activeId]}</span></div>

      <div className="admin-navbar-search" title={copy.navbar.searchUnavailable}>
        <Search size={18} aria-hidden="true" />
        <input type="search" disabled aria-label={copy.navbar.searchUnavailable} placeholder={copy.navbar.searchPlaceholder} />
      </div>

      <div className="admin-navbar-actions">
        <span className="admin-notifications-wrapper" title={copy.navbar.notificationsUnavailable}>
          <button type="button" className="admin-notifications" disabled aria-label={copy.navbar.notificationsUnavailable}>
            <Bell size={20} strokeWidth={1.7} aria-hidden="true" />
            <span className="admin-notification-indicator" aria-hidden="true" />
          </button>
        </span>

        <button type="button" className="admin-language-toggle" aria-label={copy.language} onClick={onToggleLanguage}>
          <Languages size={18} aria-hidden="true" />
          <span lang={language === 'en' ? 'ar' : 'en'}>{language === 'en' ? 'العربية' : 'English'}</span>
        </button>

        <div className="admin-navbar-profile" role="group" aria-label={copy.navbar.profileUnavailable} title={copy.navbar.profileUnavailable}>
          <span className="admin-profile-avatar" aria-hidden="true"><UserRound size={21} strokeWidth={1.7} /></span>
          <div className="admin-profile-copy"><strong>{copy.navbar.profileName}</strong><span>{copy.navbar.profileRole}</span></div>
        </div>
      </div>
    </header>
  )
}
