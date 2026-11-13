


# Authentication and navigation diagnosis

## Root cause

`RegistrationForm.jsx` validates input and calls `patientApi.registerAccount` with
`{ fullName, email, password }`. `requestPatientOperation` in `patientApi.js`
immediately throws `SERVICE_UNAVAILABLE`: no HTTP transport is implemented.
`useFormAction` correctly catches this and displays the translated account error.
Login and other authentication operations use the same unavailable adapter.

The preceding copy cleanup also changed `/__walkthrough/signup` and
`/__walkthrough/login` to mount real authentication, disconnecting the existing
isolated frontend journey. That navigation regression is now corrected.

## Environment and backend evidence

- No frontend `.env` files, API base URL, or Vite API proxy are configured.
- The checked-out backend has only its Spring Boot application class, one starter
  test, and `spring.application.name`; there are no authentication, verification,
  patient-file controllers, or security contracts to connect.
- The local HTTP service on port 8080 responded with 404 at `/`. This proves a
  listener exists, not that authentication is available. No backend log files
  were present in the checkout. No backend processes or configuration were changed.
- Browser tests reproduce real registration/login errors and verify no POST is
  sent. The failure happens before the network, so no registration response or
  CORS response exists to diagnose. No endpoints have been guessed.

## Restored navigation


Production homepage, registration, verification, login, access checks, and
patient routes remain real and fail closed until their services exist.

Development only: the normal signup and login routes enter the isolated frontend
flow automatically. No failed submission, temporary testing link, or separate
entry URL is required. Registration validation -> pending verification -> Login
validation -> file selection -> new-file or link-form validation -> original-fixture patient
dashboard. Onboarding uses /#/onboarding/*; real /#/patient/* remain protected.
Back/Forward update the normal hash router. Refresh keeps the screen and clears
all form data. No email is marked verified, no file is created/linked, and no
session or token exists. Real token callbacks still use backend verification.

The development dashboard reuses the existing component with the original project
fixtures. It shows no actual patient records. Production still excludes fixtures. Its Back control returns to onboarding.
Real protected URLs continue to use their unchanged authorization guards.

## Backend work still required

Agree and implement registration with delivery confirmation, verification and
resend/status, login/session, access/role/email/file status, secure new-file
creation and verified existing-file linking, and authorized portal workspace
loading. Connect only the existing frontend service adapter boundaries to those
contracts. The existing production workflow already requires server confirmation
and checks returning users' linked-file status. Do not replace these checks with
local flags or tokens.

## Verification

Run `npm run build`, `npm run lint`, `npm run test:auth`, `npm run test:i18n`,
`node scripts/check-preview-build.mjs`, and `npm run test:walkthrough:browser`.
The browser test requires Vite on 5173 and a production preview on 4173. It covers
both languages, visible Next/Back actions, both file paths, invalid fields,
password disposal, real authentication failures, protected route denial, no API
writes or sensitive storage, and production exclusion. These tests establish
frontend navigation and security boundaries, not successful backend registration
or email delivery.
