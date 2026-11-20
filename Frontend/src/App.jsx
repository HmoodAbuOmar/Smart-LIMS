import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { getCookieAccess } from './auth/cookieSession.js'
import { sessionIdentity, sessionRevision, subscribeSession } from './auth/sessionState.js'
// Preserve the existing shared CSS cascade after moving the homepage module.
import './components/LanguageSwitcher.css'
import './marketing/Navbar.css'
import './components/BrandLogo.css'
import PatientOnboarding from './components/PatientOnboarding.jsx'
import AuthPage from './auth/AuthPage.jsx'
import SetInvitedPassword from './auth/SetInvitedPassword.jsx'
import PatientFileStateProvider from './components/PatientFileStateProvider.jsx'
import Homepage from './marketing/Homepage.jsx'
import './App.css'
import './marketing/HomepageHero.css'
import './theme.css'
import './styles/refinements/index.css'

// Vite removes both dynamic imports and branches from production bundles.

const DevelopmentPortal = import.meta.env.DEV ? lazy(() => import('./dev/DevelopmentPortal.jsx')) : null
const DevelopmentWalkthrough = import.meta.env.DEV ? lazy(() => import('./dev/PatientPreview.jsx')) : null
const AdminPreview = import.meta.env.DEV ? lazy(() => import('./admin/AdminPreview.jsx')) : null
const AdminAccessEntry = lazy(() => import('./admin/AdminAccessEntry.jsx'))
const ReceptionistPreview = import.meta.env.DEV ? lazy(() => import('./receptionist/ReceptionistPreview.jsx')) : null
const ReceptionistAccessEntry = lazy(() => import('./receptionist/ReceptionistAccessEntry.jsx'))
const PortalEntry = lazy(() => import('./portal/PortalEntry.jsx'))

function AppRouter() {
  const [hash, setHash] = useState(() => window.location?.hash || '')
  const [registration, setRegistration] = useState(null)
  const route = hash.split('?')[0]
  useEffect(() => {
    function updateRoute() {
      setHash(window.location.hash)
      if (window.location.hash.startsWith('#/')) window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', updateRoute)
    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])
  const onboardingRoutes = {
    '#/patient/file': 'selection', '#/patient/file/new': 'createFile',
    '#/patient/file/link': 'linkFile', '#/patient/dashboard': 'dashboard',
  }
  const emailRoutes = { '#/verify-email': 'verification', '#/forgot-password': 'forgotPassword', '#/reset-password': 'resetPassword' }
  if (window.location?.pathname === '/set-password') {
    return <AuthPage key="invitation" mode="login"><SetInvitedPassword /></AuthPage>
  }
  if (window.location?.pathname === '/verify-email') return <AuthPage key="verify-link" mode="login" step="verification" />
  // Never capture a real verification callback; the production token controller
  // must still validate links, including when testing against a future backend.
  if (import.meta.env.DEV) {
    const previewRoutes = ['#/signup?preview=1', '#/verify-email?preview=1', '#/login?preview=1', '#/onboarding/file', '#/onboarding/file/new', '#/onboarding/file/link', '#/onboarding/dashboard']
    if (previewRoutes.includes(hash)) return <Suspense fallback={null}><DevelopmentWalkthrough route={hash} /></Suspense>
  }
  if (import.meta.env.DEV && route.startsWith('#/__portal/')) return <Suspense fallback={null}><DevelopmentPortal route={hash.slice('#/__portal/'.length)} onNavigate={path => { window.location.hash = `/__portal/${path}` }} /></Suspense>
  if (import.meta.env.DEV && (route === '#/__admin' || route.startsWith('#/__admin/'))) return <Suspense fallback={null}><AdminPreview key={route} page={route.slice('#/__admin/'.length)} /></Suspense>
  if (import.meta.env.DEV && (route === '#/__receptionist' || route === '#/__receptionist/today' || route === '#/__receptionist/patients' || route === '#/__receptionist/walk-in' || route === '#/__receptionist/orders' || route === '#/__receptionist/appointments' || route === '#/__receptionist/payments')) return <Suspense fallback={null}><ReceptionistPreview key={hash} page={route.endsWith('/payments') ? 'payments' : route.endsWith('/appointments') ? 'appointments' : route.endsWith('/orders') ? 'orders' : route.endsWith('/walk-in') ? 'walkIn' : route.endsWith('/patients') ? 'patients' : 'today'} /></Suspense>
  if (route === '#/admin') return <Suspense fallback={null}><AdminAccessEntry /></Suspense>
  if (route === '#/lab-technician') return <Suspense fallback={null}><ReceptionistAccessEntry role="lab_technician" /></Suspense>
  if (route === '#/receptionist' || route === '#/receptionist/today' || route === '#/receptionist/patients' || route === '#/receptionist/walk-in' || route === '#/receptionist/orders' || route === '#/receptionist/appointments' || route === '#/receptionist/payments') return <Suspense fallback={null}><ReceptionistAccessEntry key={route} page={route.endsWith('/payments') ? 'payments' : route.endsWith('/appointments') ? 'appointments' : route.endsWith('/orders') ? 'orders' : route.endsWith('/walk-in') ? 'walkIn' : route.endsWith('/patients') ? 'patients' : 'today'} /></Suspense>
  if (/^#\/patient\/(dashboard|profile|tests|review|orders|book|payment|booking-confirmation|appointments|results|history|notifications)(\/|$)/.test(route)) return <Suspense fallback={null}><PortalEntry route={hash.slice('#/patient/'.length)} /></Suspense>
  if (Object.hasOwn(emailRoutes, route)) return <AuthPage key={hash} mode="login" step={emailRoutes[route]} registration={registration} />
  if (Object.hasOwn(onboardingRoutes, route)) return <AuthPage key={hash} mode="login" step={onboardingRoutes[route]}><PatientOnboarding step={onboardingRoutes[route]} /></AuthPage>
  if (route === '#/login' || route === '#/signup') return <AuthPage key={hash} mode={route.slice(2)} onRegistered={setRegistration} />
  return <Homepage />
}


export default function App() {
  const revision = useSyncExternalStore(subscribeSession, sessionRevision, sessionRevision)
  useEffect(() => {
    const protectedRoute = () => /^#\/(patient\/|admin(?:[?/]|$)|receptionist(?:[?/]|$)|lab-technician(?:[?/]|$))/.test(window.location.hash)
    const unsubscribe = subscribeSession(reason => {
      if (reason === 'signed-out' && protectedRoute()) window.location.replace('/#/login')
    })
    const controller = new AbortController()
    function revalidate() {
      if (document.visibilityState === 'visible' && protectedRoute() && sessionIdentity()) {
        void getCookieAccess({ signal: controller.signal }).catch(() => {})
      }
    }
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    const timer = window.setInterval(revalidate, 60_000)
    return () => {
      controller.abort()
      unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [])
  return <PatientFileStateProvider key={revision}><AppRouter /></PatientFileStateProvider>
}
