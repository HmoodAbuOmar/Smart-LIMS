import { useRef, useState } from 'react'
import { CalendarCheck, Users, ClipboardList, CalendarDays, CreditCard, LogOut } from 'lucide-react'
import BrandLogo from '../../components/BrandLogo.jsx'
import LanguageSwitcher from '../../components/LanguageSwitcher.jsx'
import { receptionistSession } from '../receptionistSession.js'

const navigation = [{ key: 'today', Icon: CalendarCheck }, { key: 'patients', Icon: Users }, { key: 'orders', Icon: ClipboardList }, { key: 'appointments', Icon: CalendarDays }, { key: 'payments', Icon: CreditCard }]

export default function ReceptionistSidebar({ copy, menuOpen, onSelect }) {
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState(false)
  const busy = useRef(false)
  async function signOut() {
    if (busy.current) return
    busy.current = true
    setSigningOut(true); setError(false)
    try {
      await receptionistSession.signOut()
      window.location.hash = '/login'
    } catch (failure) { setError(failure.code === 'SERVICE_UNAVAILABLE' ? 'logoutUnavailable' : 'logoutError') }
    finally { busy.current = false; setSigningOut(false) }
  }
  return <aside className="r01-sidebar" data-open={menuOpen} id="r01-navigation">
    <div className="r01-brand"><BrandLogo className="r01-logo" /><span className="r01-role-label">{copy.workspace}</span></div>
    <nav aria-label={copy.navigation}>{navigation.map(({ key, Icon }) => <button type="button" key={key} aria-current={key === 'today' ? 'page' : undefined} aria-describedby={key !== 'today' ? 'r01-navigation-unavailable' : undefined} disabled={key !== 'today'} onClick={onSelect}><Icon size={18} aria-hidden="true" />{copy[key]}</button>)}</nav>
    <p id="r01-navigation-unavailable" className="r01-sr-only">{copy.navigationUnavailable}</p>
    <div className="r01-sidebar-footer">
      <button type="button" className="r01-logout" disabled={signingOut} aria-busy={signingOut} onClick={() => void signOut()}><LogOut size={19} strokeWidth={1.7} aria-hidden="true" /><span>{signingOut ? copy.signingOut : copy.logout}</span></button>
      {error && <p className="r01-logout-error" role="alert">{copy[error]}</p>}
      <div className="r01-language-control"><LanguageSwitcher /></div>
    </div>
  </aside>
}
