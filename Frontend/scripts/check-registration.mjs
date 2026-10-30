import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { prepareRegistration, registrationFields, toRegistrationPayload } from '../src/services/registration.js'
import { genderOptions, validatePatientDraft, toPatientFilePayload, prepareFileLink, toFileLinkPayload } from '../src/services/onboarding.js'
import { patientApi, patientDestination } from '../src/services/patientApi.js'
import { readLinkToken, validateEmail, validatePasswordReset } from '../src/services/emailFlow.js'

const account = { name: ' Patient Name ', email: ' patient@example.com ', password: 'StrongPass9!', confirmPassword: 'StrongPass9!' }
const patient = { name: 'Patient Name', phone: '+970 599 123 456', dateOfBirth: '2000-02-29', gender: 'male' }
assert.deepEqual(prepareRegistration(account), { status: 'validated', errors: {} })
assert.deepEqual(Object.keys(prepareRegistration(Object.fromEntries(registrationFields.map(field => [field, '']))).errors).sort(), [...registrationFields].sort())
assert.deepEqual(toRegistrationPayload({ ...account, ...patient }), { fullName: 'Patient Name', email: 'patient@example.com', password: account.password })
assert.equal(prepareRegistration({ ...account, confirmPassword: 'Different9!' }).errors.confirmPassword, 'passwordMismatch')
assert.deepEqual(validatePatientDraft(patient), {})
for (const phone of ['abc1234567', '++970599123456', '123', '1234567890123456']) assert.equal(validatePatientDraft({ ...patient, phone }).phone, 'phoneInvalid')
for (const dateOfBirth of ['2001-02-29', '2000-13-01', '1899-12-31', '2999-01-01']) assert.equal(validatePatientDraft({ ...patient, dateOfBirth }).dateOfBirth, 'birthInvalid')
assert.equal(validatePatientDraft({ ...patient, gender: 'other' }).gender, 'genderInvalid')
assert.ok(!('password' in toPatientFilePayload({ ...patient, ...account })))
assert.ok(prepareFileLink({ fileIdentifier: ' ' }).errors.fileIdentifier)
assert.deepEqual(toFileLinkPayload({ fileIdentifier: ' File-123 ' }), { fileIdentifier: 'File-123' })
assert.equal(patientDestination(), '#/login')
assert.equal(patientDestination({ authenticated: false, hasLinkedMedicalFile: true }), '#/login')
assert.equal(patientDestination({ authenticated: true, role: 'patient' }), '#/verify-email')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: true }), null)
assert.equal(patientDestination({ authenticated: true, role: 'admin' }), null)
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: false, hasLinkedMedicalFile: true }), '#/verify-email')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: true, hasLinkedMedicalFile: false }), '#/patient/file')
assert.equal(patientDestination({ authenticated: true, role: 'patient', emailVerified: true, hasLinkedMedicalFile: true }), '#/patient/dashboard')
assert.equal(readLinkToken({ hash: '#/verify-email?token=link-value', search: '' }), 'link-value')
assert.equal(readLinkToken({ hash: '#/reset-password', search: '?token=link-value' }), 'link-value')
assert.deepEqual(validateEmail({ email: ' ' }), { email: 'emailRequired' })
assert.deepEqual(validateEmail({ email: 'bad' }), { email: 'emailInvalid' })
assert.deepEqual(validatePasswordReset({ password: account.password, confirmPassword: account.password }), {})
assert.equal(validatePasswordReset({ password: account.password, confirmPassword: 'different' }).confirmPassword, 'passwordMismatch')
for (const operation of Object.values(patientApi)) await assert.rejects(operation(), error => error.code === 'SERVICE_UNAVAILABLE')
const controller = new AbortController()
controller.abort()
await assert.rejects(patientApi.getAccess({ signal: controller.signal }), error => error.name === 'AbortError')

globalThis.window = { location: { hash: '' }, localStorage: { getItem: () => 'en', setItem() {} } }
globalThis.document = { documentElement: {}, querySelector: () => null }
// Check the real production route/controller contract, independent of the
// development-only flow (covered by check-development-preview.mjs).
const server = await createServer({ define: { 'import.meta.env.DEV': 'false' }, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { default: i18n } = await server.ssrLoadModule('/src/i18n.js')
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const { PatientOnboardingContent } = await server.ssrLoadModule('/src/components/PatientOnboarding.jsx')
  const { default: VerificationCard } = await server.ssrLoadModule('/src/components/EmailVerificationCard.jsx')
  const routes = ['#/signup', '#/login', '#/verify-email', '#/forgot-password', '#/reset-password', '#/patient/file', '#/patient/file/new', '#/patient/file/link', '#/patient/dashboard']
  for (const language of ['ar', 'en']) {
    await i18n.changeLanguage(language)
    const recipient = 'recipient@example.org'
    const waiting = renderToStaticMarkup(createElement(VerificationCard, { email: recipient, status: 'pending', canResend: true, deliveryConfirmed: true }))
    assert.ok(waiting.includes(recipient) && waiting.includes(i18n.t('verification.pending', { ns: 'auth' })))
    assert.equal((waiting.match(/<button /g) || []).length, 1)
    assert.equal((waiting.match(/<a /g) || []).length, 1)
    assert.ok(!waiting.includes('<input') && !waiting.includes('preview.patient') && !waiting.includes('dev-preview'))
    const cooldown = renderToStaticMarkup(createElement(VerificationCard, { email: recipient, cooldown: 30, canResend: true }))
    assert.ok(cooldown.includes('disabled=""'))
    const expired = renderToStaticMarkup(createElement(VerificationCard, { email: recipient, status: 'expired', canResend: true }))
    assert.ok(!expired.includes('disabled=""'), 'Expired state permits resend with a known recipient')
    const verified = renderToStaticMarkup(createElement(VerificationCard, { status: 'verified' }))
    assert.ok(!verified.includes('<button') && (verified.match(/<a /g) || []).length === 1)
    const noContext = renderToStaticMarkup(createElement(VerificationCard, {}))
    assert.ok(!noContext.includes('email-verification-address') && noContext.includes('disabled=""'))
    for (const route of routes) {
      window.location.hash = route
      const markup = renderToStaticMarkup(createElement(App))
      // Dashboard now belongs to the lazy protected portal, not the split auth card.
      // Its server access behavior is checked in the browser portal test.
      if (route === '#/patient/dashboard') { assert.ok(!markup.includes('<input') && !markup.includes('SAMPLE-')); continue }
      assert.ok(markup.includes('class="auth-branding"') && markup.includes('class="auth-tabs"'))
      assert.ok(!markup.match(/(?:auth|common):[\w.]+/))
      const content = markup.match(/<section class="auth-form-panel"[^>]*>([\s\S]*?)<\/section>/)?.[1] || ''
      assert.ok(!content.match(/preview|demo|mock|backend|API not ready|معاينة|تجريبي|النظام الخلفي|فحص المسودة/i), `${language} ${route}: real patient copy`)
      assert.ok(!markup.includes('role="alert"'), 'No permanent unavailable-operation notice')
      if (route === '#/signup') {
        for (const field of registrationFields) assert.ok(markup.includes(`name="${field}"`))
        for (const field of ['phone', 'dateOfBirth', 'gender']) assert.ok(!markup.includes(`name="${field}"`))
      }
      if (route.startsWith('#/patient/')) assert.ok(!markup.includes('<input'), 'Protected form is not rendered before authorization')
      if (route === '#/login') assert.ok(!markup.includes('disabled=""'))
    }
    // Render the authorized content alone to check its form structure without
    // inventing a session, server response, record or verification result.
    const patientForm = renderToStaticMarkup(createElement(PatientOnboardingContent, { step: 'createFile' }))
    const orderedFields = [...patientForm.matchAll(/name="(name|dateOfBirth|gender|phone)"/g)].map(match => match[1])
    assert.deepEqual(orderedFields, ['name', 'dateOfBirth', 'gender', 'phone'])
    for (const gender of genderOptions) assert.ok(patientForm.includes(`value="${gender}"`))
    assert.ok(patientForm.includes('type="date"') && patientForm.includes('type="tel"'))
    assert.ok(!patientForm.includes('name="password"'))
    const link = renderToStaticMarkup(createElement(PatientOnboardingContent, { step: 'linkFile' }))
    assert.ok(link.includes('name="fileIdentifier"'))
    const selection = renderToStaticMarkup(createElement(PatientOnboardingContent, { step: 'selection' }))
    assert.ok(selection.includes('lucide-folder-plus') && selection.includes('lucide-link'))
    assert.ok(selection.includes('href="#/patient/file/new"') && selection.includes('href="#/patient/file/link"'))
  }
  console.log('Frontend checks passed: account/patient validation, verification/recovery routes, token parsing, EN/AR rendering, unavailable adapters, cancellation, verification gating, protected forms, and returning-patient routing policy. Backend end-to-end operations were not tested.')
} finally {
  await server.close()
  delete globalThis.window
  delete globalThis.document
}
