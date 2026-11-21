import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { authenticatedRequest, logoutWithCookie } from '../auth/cookieSession.js'
import './WorkspaceAccountMenu.css'

const labels = {
  en: { account: 'Account', profile: 'My Profile', logout: 'Log out', close: 'Close', loading: 'Loading…', unavailable: 'Profile details are unavailable.', logoutError: 'Sign-out could not be confirmed. Please try again.', name: 'Name', email: 'Email', username: 'Username', phone: 'Phone number' },
  ar: { account: 'الحساب', profile: 'ملفي الشخصي', logout: 'تسجيل الخروج', close: 'إغلاق', loading: 'جارٍ التحميل…', unavailable: 'تفاصيل الملف الشخصي غير متاحة.', logoutError: 'تعذّر تأكيد تسجيل الخروج. يرجى المحاولة مجددًا.', name: 'الاسم', email: 'البريد الإلكتروني', username: 'اسم المستخدم', phone: 'رقم الهاتف' },
}

function StaffProfile({ copy, live, onClose }) {
  const dialog = useRef(null)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  useEffect(() => {
    if (!live) return
    const controller = new AbortController()
    authenticatedRequest('/api/auth/me', { signal: controller.signal }).then(
      account => { if (!controller.signal.aborted) setResult({ account }) },
      () => { if (!controller.signal.aborted) setResult({ error: true }) },
    )
    return () => controller.abort()
  }, [live])
  const account = result?.account
  return <dialog ref={dialog} className="workspace-profile-dialog" aria-label={copy.profile}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <h2>{copy.profile}</h2>
    {account ? <dl>{[['name', 'fullName'], ['email', 'email'], ['username', 'userName'], ['phone', 'phoneNumber']].map(([label, field]) =>
      <div key={field}><dt>{copy[label]}</dt><dd><bdi>{account[field] || '—'}</bdi></dd></div>)}</dl>
      : <p role={result?.error ? 'alert' : 'status'}>{!live || result?.error ? copy.unavailable : copy.loading}</p>}
    <button type="button" autoFocus onClick={onClose}>{copy.close}</button>
  </dialog>
}

export default function WorkspaceAccountMenu({ name, language, live = false, onProfile, onLogout, matchPatient = false }) {
  const copy = labels[language]
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  const lock = useRef(false)
  useEffect(() => {
    if (!open) return
    function outside(event) { if (!root.current?.contains(event.target)) setOpen(false) }
    function escape(event) { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    if (matchPatient) document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      if (matchPatient) document.removeEventListener('keydown', escape)
    }
  }, [open, matchPatient])
  async function logout() {
    if (lock.current) return
    lock.current = true
    setPending(true)
    setFailed(false)
    try {
      if (onLogout) await onLogout()
      else {
        if (live) await logoutWithCookie()
        window.location.hash = '/login'
      }
    } catch { setFailed(true) }
    finally { lock.current = false; setPending(false) }
  }
  function showProfile() {
    setOpen(false)
    if (onProfile) onProfile()
    else setProfile(true)
  }
  return <div className="workspace-account portal-account" ref={root} onBlur={event => {
    if (!matchPatient && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
  }}>
    <button ref={trigger} type="button" aria-label={copy.account} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="workspace-account-avatar"><UserRound size={18} aria-hidden="true" /></span>
      {name && <span className="workspace-account-name">{matchPatient ? name : <bdi>{name}</bdi>}</span>}
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div className="workspace-account-menu portal-account-menu">
      <button type="button" onClick={showProfile}><UserRound size={16} aria-hidden="true" />{copy.profile}</button>
      <button type="button" disabled={pending} onClick={logout}><LogOut size={16} aria-hidden="true" />{copy.logout}</button>
      {failed && <p role="alert">{copy.logoutError}</p>}
    </div>}
    {profile && <StaffProfile copy={copy} live={live} onClose={() => {
      setProfile(false)
      requestAnimationFrame(() => trigger.current?.focus())
    }} />}
  </div>
}
