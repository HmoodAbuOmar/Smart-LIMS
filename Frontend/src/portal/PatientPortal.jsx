import { useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Bell, CalendarDays, ChevronDown, ClipboardList, FileText, FlaskConical, History, LayoutDashboard, LogOut, Menu, Search, UserRound, X } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import MedicalHistory from './history/MedicalHistory.jsx'
import { portalReducer, todayValue, totalPrice } from './portalModel.js'
import { formatCurrency } from '../utils/currency.js'
import { patientDisplayName } from '../utils/patientDisplayName.js'
import './booking/BookingFlow.css'
import BookingCheckout from './booking/BookingCheckout.jsx'
import BookingReceipt from './booking/BookingReceipt.jsx'
import PaymentMethod from './booking/PaymentMethod.jsx'
import { bookingDraftError, checkoutDraft } from './booking/bookingModel.js'
import { bookingApi, portalApi } from '../services/portalApi.js'
import { processHostedPayment } from '../services/hostedPayment.js'
import { isInternalRecord, patientFacingWorkspace, verifiedBookingResponse } from './patientState.js'
import Dashboard from './pages/PatientDashboard.jsx'
import Profile from './pages/PatientProfile.jsx'
import Catalog from './pages/TestsCatalog.jsx'
import TestDetails from './pages/TestDetails.jsx'
import Review from './booking/ReviewOrder.jsx'
import Orders from './pages/MyOrders.jsx'
import OrderDetails from './pages/OrderDetails.jsx'
import Booking from './booking/AppointmentReschedule.jsx'
import Appointments from './booking/MyAppointments.jsx'
import Results from './pages/MyResults.jsx'
import Report from './pages/LabResultReport.jsx'
import Notifications from './pages/MyNotifications.jsx'
import CalendarPicker from './booking/components/CalendarPicker.jsx'
import ReportDownload from './components/ReportDownload.jsx'
import { Title, Button, Status, Empty, FilterTabs, Field } from './components/PortalUi.jsx'
import { Portal } from './PortalContext.js'
import './Portal.css'

const navItems = [['dashboard', LayoutDashboard], ['tests', FlaskConical], ['orders', ClipboardList], ['appointments', CalendarDays], ['results', FileText], ['history', History], ['notifications', Bell], ['profile', UserRound]]

export default function PatientPortal({ initialData, development = false, route = 'dashboard', onNavigate, onExit, onBack, onStateChange }) {
  const { i18n } = useTranslation()
  const { t } = useTranslation('portal')
  const [state, dispatch] = useReducer(portalReducer, initialData, data => import.meta.env.DEV && development ? data : patientFacingWorkspace(data))
  useEffect(() => { if (import.meta.env.DEV && development) onStateChange?.(state) }, [state, development, onStateChange])
  const [notice, setNotice] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [transactionBusy, setTransactionBusy] = useState(false)
  const bookingLock = useRef(false)
  const accountRef = useRef(null)
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'
  const local = value => Array.isArray(value) ? value[language === 'ar' ? 1 : 0] : value
  const date = value => value ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : '—'
  const money = value => <bdi dir="ltr">{formatCurrency(value, language)}</bdi>
  const number = value => new Intl.NumberFormat(language).format(value)
  const datetime = value => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const name = patientDisplayName(language === 'ar' && state.profile.nameAr ? state.profile.nameAr : state.profile.name, t('samplePatient')) || t('samplePatient')
  const navigate = path => { if (bookingLock.current) return; setMobileOpen(false); setAccountOpen(false); setNotice(''); onNavigate(path) }
  const [path, query = ''] = route.split('?'), [page = 'dashboard', id] = path.split('/')
  useEffect(() => { document.title = 'Smart-LIMS | Patient Portal'; document.querySelector('.portal-page-title')?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }) }, [route, t, page])
  useEffect(() => {
    function close(event) { if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false) }
    function escape(event) { if (event.key === 'Escape') { setMobileOpen(false); setAccountOpen(false) } }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [])
  async function commit(action, message) {
    if (import.meta.env.DEV && development) {
      // Original local reducer actions are scoped to the fixture workspace.
      // They never invoke an API or alter authentication/authorization state.
      if (action.type === 'ORDER') {
        const id = `SAMPLE-${crypto.randomUUID()}`
        dispatch({ ...action, id, date: todayValue() })
        if (message) setNotice(message)
        return { order: { id } }
      }
      dispatch(action)
      if (message) setNotice(message)
      return true
    }
    setBusy(true)
    try {
      const operations = { PROFILE: 'saveProfile', ORDER: 'createOrder', APPOINTMENT: action.existing ? 'rescheduleAppointment' : 'bookAppointment', CANCEL: 'cancelAppointment' }
      const operation = operations[action.type]
      if (!operation) throw new Error('Unsupported operation')
      const response = await portalApi[operation](action)
      if (response?.confirmed !== true) throw new Error('Operation was not confirmed')
      if (action.type === 'PROFILE') {
        if (!response.profile || response.profile.fileNumber !== state.profile.fileNumber) throw new Error('Profile was not confirmed')
        dispatch({ type: 'PROFILE', profile: response.profile })
      } else {
        const collection = action.type === 'ORDER' ? 'orders' : 'appointments'
        const record = action.type === 'ORDER' ? response.order : response.appointment
        if (!record?.id || isInternalRecord(record) || record.patientId !== state.profile.fileNumber) throw new Error('Record was not confirmed')
        dispatch({ type: 'SERVER_RECORD', collection, record: { ...record, source: 'server' } })
      }
      if (message) setNotice(message)
      return response
    } catch { setNotice('operationPending'); return false }
    finally { setBusy(false) }
  }
  async function finishBooking(options = {}) {
    const draft = checkoutDraft(state)
    if (bookingLock.current || draft.stage !== 'reviewed') return { ok: false, error: 'bookingUnavailable' }
    const invalid = bookingDraftError(state)
    if (invalid) return { ok: false, error: invalid }
    bookingLock.current = true; setTransactionBusy(true); dispatch({ type: 'CHECKOUT_START' })
    try {
      const payload = { requestId: draft.requestId, tests: draft.tests, date: draft.date, time: draft.time, method: draft.method, type: draft.type, orderId: draft.orderId || undefined }
      let response
      if (draft.method === 'online') {
        response = await processHostedPayment({ api: bookingApi, payload, receiptEmail: options.receiptEmail, confirmCard: options.confirmCard, expectedAmount: totalPrice(draft.tests, state.tests) })
      } else response = await bookingApi.confirmPayAtLaboratory(payload)
      const verified = verifiedBookingResponse(response, draft, state.profile)
      if (!verified) { dispatch({ type: 'CHECKOUT_PENDING', requestId: draft.requestId, failure: 'bookingUnavailable' }); return { ok: false, pending: true } }
      dispatch({ type: 'CHECKOUT_SERVER_COMPLETE', requestId: draft.requestId, ...verified })
      return { ok: true, bookingId: verified.appointment.id }
    } catch (error) {
      if (error.code === 'BOOKING_CONFLICT') { dispatch({ type: 'CHECKOUT_FAILED', requestId: draft.requestId }); return { ok: false, error: 'bookingConflict' } }
      if (error.code === 'PAYMENT_DECLINED') { dispatch({ type: 'CHECKOUT_FAILED', requestId: draft.requestId }); return { ok: false, error: 'paymentUnavailable' } }
      dispatch({ type: 'CHECKOUT_PENDING', requestId: draft.requestId, failure: draft.method === 'online' ? 'paymentUnavailable' : 'bookingUnavailable' })
      return { ok: false, pending: true }
    } finally { bookingLock.current = false; setTransactionBusy(false) }
  }
  function addAndBook(id) { if (!bookingLock.current) { dispatch({ type: 'ADD', id }); navigate('book') } }
  const value = { state, dispatch, development, t, local, date, money, number, name, navigate, commit, notice, setNotice, busy: busy || transactionBusy, language, datetime, finishBooking, addAndBook }
  const bookingUi = { Title, Button, Empty, Field, CalendarPicker }
  const historyUi = { Title, Button, Empty, Field, Status, FilterTabs, ReportDownload }
  const unread = state.notifications.filter(n => !n.read).length
  const rootPage = ['book', 'payment', 'booking-confirmation'].includes(page) ? 'appointments' : page === 'review' ? 'orders' : page
  function submitSearch(event) { event.preventDefault(); navigate(`tests?q=${encodeURIComponent(globalSearch.trim())}`) }
  return <Portal.Provider value={value}><div className="patient-portal" dir={language === 'ar' ? 'rtl' : 'ltr'}>
    <a href="#portal-content" className="portal-skip" onClick={e => { e.preventDefault(); document.querySelector('.portal-page-title')?.focus() }}>{t('skip')}</a>
    {mobileOpen && <button type="button" className="portal-scrim" aria-label={t('close')} onClick={() => setMobileOpen(false)} />}
    <aside className={`portal-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label={t('menu')}>
      <button className="portal-logo" onClick={() => navigate('dashboard')} aria-label="Smart-LIMS"><BrandLogo /></button>
      <button type="button" className="portal-mobile-close" onClick={() => setMobileOpen(false)} aria-label={t('close')}><X size={20} /></button>
      <nav>{navItems.map(([key, Icon]) => <button key={key} data-page={key} aria-current={rootPage === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon size={18} /><span>{t(key)}</span>{key === 'notifications' && unread > 0 && <small>{number(unread)}</small>}</button>)}</nav>
      <div className="portal-sidebar-bottom"><LanguageSwitcher /></div>
    </aside>
    <div className="portal-workspace">
      <header className="portal-topbar">
        <button type="button" className="portal-menu" aria-label={t('menu')} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><Menu /></button>
        <form role="search" className="portal-search" onSubmit={submitSearch}><Search size={16} aria-hidden="true" /><input name="portal-search" aria-label={t('search')} placeholder={t('search')} value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} /><button type="submit" aria-label={t('search')}><ArrowRight size={17} /></button></form>
        <button className="portal-bell" onClick={() => navigate('notifications')} aria-label={`${t('notifications')}: ${number(unread)}`}><Bell size={20} />{unread > 0 && <span>{number(unread)}</span>}</button>
        <div className="portal-account" ref={accountRef}><button type="button" aria-label={t('account')} aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}><span className="portal-avatar"><UserRound size={18} /></span><span className="portal-account-name">{name}</span><ChevronDown size={14} /></button>
          {accountOpen && <div className="portal-account-menu"><button onClick={() => navigate('profile')}><UserRound size={16} />{t('profile')}</button><button onClick={onExit}><LogOut size={16} />{t('logout')}</button></div>}
        </div>
      </header>
      <main id="portal-content" className="portal-main">
        <nav className="portal-breadcrumb" aria-label={t('home')}>{onBack && page === 'dashboard' && <><button className="portal-onboarding-back" onClick={onBack}>{t('back')}</button><span>·</span></>}<button onClick={() => navigate('dashboard')}>{t('home')}</button><span>/</span><span>{t(rootPage === 'tests' && id ? 'test' : rootPage === 'results' && id ? 'resultReport' : page === 'review' ? 'reviewTitle' : page === 'book' ? 'bookTitle' : page === 'payment' ? 'payment' : page === 'booking-confirmation' ? 'bookingConfirmation' : rootPage)}</span></nav>
        {notice && <div className={`portal-notice ${notice === 'unavailable' || notice === 'pdfError' ? 'is-error' : ''}`} role="status">{t(notice)}<button aria-label={t('close')} onClick={() => setNotice('')}><X size={16} /></button></div>}
        {page === 'dashboard' ? <Dashboard /> : page === 'profile' ? <Profile /> : page === 'tests' && id ? <TestDetails id={id} /> : page === 'tests' ? <Catalog key={query} query={query} /> : page === 'review' ? <Review /> : page === 'orders' && id ? <OrderDetails id={id} /> : page === 'orders' ? <Orders /> : page === 'book' ? (new URLSearchParams(query).has('reschedule') ? <Booking key={query} query={query} /> : <BookingCheckout api={value} ui={bookingUi} query={query} />) : page === 'payment' ? <PaymentMethod api={value} ui={bookingUi} /> : page === 'booking-confirmation' ? <BookingReceipt api={value} ui={bookingUi} id={id} /> : page === 'appointments' && id ? <BookingReceipt api={value} ui={bookingUi} id={id} details /> : page === 'appointments' ? <Appointments /> : page === 'results' && id ? <Report id={id} /> : page === 'results' ? <Results /> : page === 'history' ? <MedicalHistory key={id || 'archive'} api={value} ui={historyUi} visitId={id} query={query} /> : page === 'notifications' ? <Notifications /> : <Empty title="notFound" action="backDashboard" onClick={() => navigate('dashboard')} />}
      </main>
    </div>
  </div></Portal.Provider>
}
