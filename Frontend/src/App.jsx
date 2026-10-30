import { lazy, Suspense, useEffect, useState } from 'react'
// Preserve the existing shared CSS cascade after moving the homepage module.
import './components/LanguageSwitcher.css'
import './components/Navbar.css'
import './components/BrandLogo.css'
import PatientOnboarding from './components/PatientOnboarding.jsx'
import AuthPage from './auth/AuthPage.jsx'
import PatientFileStateProvider from './components/PatientFileStateProvider.jsx'
import Homepage from './Homepage.jsx'
import './App.css'
import './Hero.css'
import './theme.css'
import './styles/refinements/index.css'

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
  if (/^#\/patient\/(dashboard|profile|tests|review|orders|book|payment|booking-confirmation|appointments|results|history|notifications)(\/|$)/.test(route)) return <Suspense fallback={null}><PortalEntry route={hash.slice('#/patient/'.length)} /></Suspense>
  if (Object.hasOwn(emailRoutes, route)) return <AuthPage key={hash} mode="login" step={emailRoutes[route]} registration={registration} />
  if (Object.hasOwn(onboardingRoutes, route)) return <AuthPage key={hash} mode="login" step={onboardingRoutes[route]}><PatientOnboarding step={onboardingRoutes[route]} /></AuthPage>
  if (route === '#/login' || route === '#/signup') return <AuthPage key={hash} mode={route.slice(2)} onRegistered={setRegistration} />
  return <Homepage />
}


export default function App() {
  return <PatientFileStateProvider><AppRouter /></PatientFileStateProvider>
}
