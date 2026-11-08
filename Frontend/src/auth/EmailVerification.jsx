import { useEffect, useRef, useState } from 'react'
import { authApi as patientApi } from './api.js'
import { actionErrorKey } from './access.js'
import { readLinkToken, clearLinkToken, validateEmail } from '../services/emailFlow.js'
import useFormAction from '../utils/useFormAction.js'
import EmailVerificationCard from './EmailVerificationCard.jsx'

export default function EmailVerification({ registration }) {
  const token = useRef(readLinkToken(window.location))
  const [email, setEmail] = useState(registration?.email || '')
  const [verificationId, setVerificationId] = useState(registration?.verificationId || '')
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(registration?.emailSent === true)
  const [status, setStatus] = useState(() => readLinkToken(window.location) ? 'checking' : 'pending')
  const [attempt, setAttempt] = useState(0)
  const [checkError, setCheckError] = useState(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now)
  const { pending, failure, submit } = useFormAction({
    values: { email, verificationId }, fields: [], validate: () => ({}),
    action: (details, options) => {
      if (!details.verificationId && Object.keys(validateEmail({ email: details.email })).length) throw new Error('A recipient is required')
      return patientApi.resendVerification({ ...(details.email ? { email: details.email.trim() } : {}), ...(details.verificationId ? { verificationId: details.verificationId } : {}) }, options)
    },
    onSuccess: result => {
      if (result?.emailSent !== true) throw new Error('Email dispatch was not confirmed')
      token.current = ''
      if (typeof result.verificationId === 'string') setVerificationId(result.verificationId)
      const seconds = Number.isFinite(result.retryAfterSeconds) ? Math.min(300, Math.max(60, result.retryAfterSeconds)) : 60
      const time = Date.now()
      setNow(time)
      setCooldownUntil(time + seconds * 1000)
      setDeliveryConfirmed(true)
      setStatus('pending')
      setCheckError(null)
      setAttempt(previous => previous + 1)
    },
  })
  useEffect(() => {
    if (!cooldownUntil) return
    const timer = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= cooldownUntil) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    clearLinkToken()
    if (!token.current && !verificationId) return
    const controller = new AbortController()
    let timer
    async function check() {
      if (token.current) setStatus('checking')
      try {
        const result = token.current
          ? await patientApi.verifyEmail({ token: token.current }, { signal: controller.signal })
          : await patientApi.verificationStatus({ verificationId }, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (!['verified', 'expired', 'invalid', 'pending'].includes(result?.status)) throw new Error('Verification result was not confirmed')
        token.current = ''
        if (typeof result.email === 'string' && !Object.keys(validateEmail({ email: result.email })).length) setEmail(result.email)
        if (typeof result.verificationId === 'string' && result.verificationId !== verificationId) setVerificationId(result.verificationId)
        setCheckError(null)
        setStatus(result.status)
        if (result.status === 'pending' && verificationId) timer = window.setTimeout(check, 15000)
      } catch (error) {
        if (controller.signal.aborted) return
        const known = error?.code === 'TOKEN_EXPIRED' ? 'expired' : error?.code === 'TOKEN_INVALID' ? 'invalid' : null
        if (known) { token.current = ''; setStatus(known) }
        else { setStatus('pending'); setCheckError(actionErrorKey(error?.code, 'errors.verificationUnavailable')) }
      }
    }
    void check()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [attempt, verificationId])

  useEffect(() => {
    function checkOnReturn() { if (document.visibilityState === 'visible' && !['verified', 'expired', 'invalid'].includes(status)) setAttempt(previous => previous + 1) }
    document.addEventListener('visibilitychange', checkOnReturn)
    return () => document.removeEventListener('visibilitychange', checkOnReturn)
  }, [status])

  function resend(event) {
    event.preventDefault()
    if (Date.now() < cooldownUntil || pending || status === 'checking' || status === 'verified') return
    void submit(event)
  }
  return <EmailVerificationCard email={email} status={status} deliveryConfirmed={deliveryConfirmed}
    pending={pending} cooldown={Math.max(0, Math.ceil((cooldownUntil - now) / 1000))}
    canResend={Boolean(verificationId) || Boolean(email && !Object.keys(validateEmail({ email })).length)}
    error={status === 'verified' ? undefined : failure ? actionErrorKey(failure, 'errors.verificationUnavailable') : checkError} onResend={resend} />
}

