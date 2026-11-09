import { useTranslation } from 'react-i18next'
import { CheckCircle2, MailCheck } from 'lucide-react'
import '../components/EmailVerificationCard.css'

// Presentation only; delivery/verification must be supplied by the real controller.
export default function EmailVerificationCard({ email = '', status = 'pending', deliveryConfirmed = false, pending = false, cooldown = 0, canResend = false, error, onResend, loginHref = '#/login', navigation }) {
  const { t, i18n } = useTranslation('auth')
  const verified = status === 'verified'
  const statusKey = verified ? 'verified' : status === 'expired' ? 'expired' : status === 'invalid' ? 'invalid' : status === 'checking' ? 'checking' : 'pending'
  return <div className="email-verification-card" aria-busy={pending || status === 'checking'}>
    <div className="email-verification-icon" aria-hidden="true">{verified ? <CheckCircle2 size={32} strokeWidth={1.5} /> : <MailCheck size={32} strokeWidth={1.5} />}</div>
    <h1 id="auth-heading" tabIndex={-1}>{t('verification.title')}</h1>
    {!verified && <>
      <p id="auth-description">{t(deliveryConfirmed ? 'verification.explanationSent' : 'verification.explanation')}</p>
      {email && <p className="email-verification-address"><bdi dir="ltr">{email}</bdi></p>}
    </>}
    <p className="email-verification-status" role="status" aria-live="polite" aria-atomic="true">{t('verification.' + statusKey)}</p>
    {error && <span className="auth-error email-verification-error" role="alert">{t(error)}</span>}
    {verified ? <a className="auth-submit" href={loginHref}>{t('verification.continueLogin')}</a> : <>
      <form noValidate onSubmit={onResend}>
        <button type="submit" className="auth-submit" disabled={!canResend || pending || status === 'checking' || cooldown > 0}>
          {pending ? t('verification.sending') : cooldown > 0 ? t('verification.resendCountdown', { seconds: new Intl.NumberFormat(i18n.resolvedLanguage).format(cooldown) }) : t('verification.resend')}
        </button>
      </form>
      <p className="email-verification-helper">{t('verification.spamHint')}</p>
      {navigation ?? <a className="auth-switch" href={loginHref}>{t('workflow.backLogin')}</a>}
    </>}
  </div>
}
