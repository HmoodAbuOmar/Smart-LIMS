import { Menu, X } from 'lucide-react'
import WorkspaceRoleLabel from '../../components/WorkspaceRoleLabel.jsx'
import WorkspaceAccountMenu from '../../components/WorkspaceAccountMenu.jsx'
import '../adminNavbar.css'

export default function AdminNavbar({ copy, language, mobileOpen, onToggleMenu, menuButtonRef, profile, live }) {
  return (
    <header className="admin-header">
      <button ref={menuButtonRef} type="button" className="admin-menu-toggle" aria-controls="admin-navigation"
        aria-expanded={mobileOpen} aria-label={mobileOpen ? copy.closeMenu : copy.openMenu} onClick={onToggleMenu}>
        {mobileOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
      </button>

      <WorkspaceRoleLabel role="admin" language={language} />

      <WorkspaceAccountMenu name={profile?.displayName || copy.navbar.profileName} language={language} live={live} matchPatient />
    </header>
  )
}
