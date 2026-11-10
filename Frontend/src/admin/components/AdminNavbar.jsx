import { Bell, Menu, Search, UserRound, X } from 'lucide-react'
import '../adminNavbar.css'

export default function AdminNavbar({ copy, activeId, mobileOpen, onToggleMenu, menuButtonRef }) {
  return (
    <header className="admin-header">
      <button ref={menuButtonRef} type="button" className="admin-menu-toggle" aria-controls="admin-navigation"
        aria-expanded={mobileOpen} aria-label={mobileOpen ? copy.closeMenu : copy.openMenu} onClick={onToggleMenu}>
        {mobileOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
      </button>

      <div className="admin-header-heading"><h1>{['patients', 'tests', 'parameters', 'referenceRanges', 'bookingSlots', 'operationsPayments'].includes(activeId) ? copy.items[activeId] : activeId === 'users' ? copy.usersManagementTitle : copy.title}</h1>
        {!['overview', 'users', 'patients', 'tests', 'parameters', 'referenceRanges', 'bookingSlots', 'operationsPayments'].includes(activeId) && <span>{copy.items[activeId]}</span>}
      </div>

      <div className="admin-navbar-search" title={copy.navbar.searchUnavailable}>
        <Search size={16} aria-hidden="true" />
        <input type="search" disabled aria-label={copy.navbar.searchUnavailable} placeholder={copy.navbar.searchPlaceholder} />
      </div>

      <div className="admin-navbar-actions">
        <span className="admin-notifications-wrapper" title={copy.navbar.notificationsUnavailable}>
          <button type="button" className="admin-notifications" disabled aria-label={copy.navbar.notificationsUnavailable}>
            <Bell size={20} aria-hidden="true" />
          </button>
        </span>

        <div className="admin-navbar-profile" role="group" aria-label={copy.navbar.profileUnavailable} title={copy.navbar.profileUnavailable}>
          <span className="admin-profile-avatar" aria-hidden="true"><UserRound size={18} /></span>
          <div className="admin-profile-copy"><strong>{copy.navbar.profileName}</strong><span>{copy.navbar.profileRole}</span></div>
        </div>
      </div>
    </header>
  )
}
