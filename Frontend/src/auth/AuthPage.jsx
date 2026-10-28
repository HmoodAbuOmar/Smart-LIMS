import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Login from './Login.jsx'
import RegistrationForm from './RegistrationForm.jsx'
import EmailVerification from './EmailVerification.jsx'
import ForgotPassword from './ForgotPassword.jsx'
import ResetPassword from './ResetPassword.jsx'
import AuthLayout from './AuthLayout.jsx'

export default function AuthPage({ mode, step = 'account', registration, onRegistered, children }) {
  const { t, i18n } = useTranslation(['auth', 'common'])
  useEffect(() => {
    document.title = 'Smart-LIMS'
    document.getElementById('auth-heading')?.focus()
    return () => { document.title = 'Smart-LIMS' }
  }, [mode, step, t, i18n.resolvedLanguage])
  return <AuthLayout mode={mode}>
    {children ?? (step === 'verification' ? <EmailVerification registration={registration} /> : step === 'forgotPassword' ? <ForgotPassword /> : step === 'resetPassword' ? <ResetPassword /> : mode === 'login' ? <Login mode={mode} /> : <RegistrationForm onRegistered={onRegistered} />)}
  </AuthLayout>
}
