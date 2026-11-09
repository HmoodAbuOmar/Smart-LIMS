# Smart-LIMS authentication module

This module contains the existing full-page split-card authentication UI. It reuses the official logo, CSS decorations, shared language toggle, validation and styling. It does not implement a backend or combine account registration with patient medical-file creation.

## Components and dependencies

| File | Responsibility |
| --- | --- |
| `AuthPage.jsx` | Compose account/recovery screens, manage heading focus/title, and accept onboarding content through `children`. |
| `AuthLayout.jsx` | Split-card shell, logo alignment, language switcher and Login/Sign Up tabs. |
| `Login.jsx` | Email/password, visibility, validation, errors and server-access destination checks. |
| `RegistrationForm.jsx` | Full name, email, password/confirmation and delivery-confirmed registration transition. |
| `EmailVerification.jsx` | Link verification, scoped status polling, errors/expiry and resend cooldown. |
| `EmailVerificationCard.jsx` | Verification presentation without manual status selectors or invented recipients. |
| `ForgotPassword.jsx`, `ResetPassword.jsx`, `PasswordRecovery.jsx` | Recovery entry components and shared request/new-password implementation. |
| `api.js` | Account/session interface over `../services/serviceTransport.js`. |
| `access.js` | Patient destination policy and normalized error keys. |
| `index.js` | Public account/layout component exports. |

Old paths in `../components/AuthModal.jsx`, `RegistrationForm.jsx`, `EmailAuthentication.jsx` and `EmailVerificationCard.jsx` remain compatibility exports. The module reuses `../components/AuthModal.css`, `EmailVerificationCard.css`, `BrandLogo.jsx` and `LanguageSwitcher.jsx`. Helpers remain in `../services/registration.js`, `emailFlow.js`, `../utils/authValidation.js` and `useFormAction.js`.

`App.jsx` composes patient onboarding through `../components/PatientOnboarding.jsx` and `PatientFileStateProvider.jsx`; it is not an authentication-module page. The portal and its authorized workspace entry are separate modules.

## Routes and account flow

The hash router in `../App.jsx` maps:

- `/#/signup` and `/#/login` to account forms.
- `/#/verify-email` to email-link confirmation/resend.
- `/#/forgot-password` to a reset-link request.
- `/#/reset-password?token=...` to a new-password form.

There is no OTP/code-entry page or standalone resend-code screen. Resend is an action inside verification.

Sign Up requires four account fields only. Sign Up/reset passwords need at least eight Unicode characters with a letter, a number and a non-whitespace symbol; confirmation must match. Login requires a valid email and nonempty password. Confirmation passwords are UI-only and not sent in registration/reset payloads.

Production registration advances only when the adapter returns `accountCreated === true`, `verificationEmailSent === true` and a nonempty `verificationId`. The registered email/challenge are retained in App memory, not browser storage. A direct verification visit without recipient/challenge context does not invent an email or enable an arbitrary resend.

`emailFlow.js` reads link tokens and removes them from the URL. Verification accepts only `pending`, `verified`, `expired` or `invalid` adapter statuses. Pending status can be checked every 15 seconds with a verification ID. Failed checks stop that polling chain; visibility-return/retry behavior can trigger another check. Resend starts cooldown only after `emailSent === true`: 60 seconds by default, with supplied intervals bounded to 60-300 seconds. Only a verified response shows confirmation and Continue to Login.

Forgot Password displays its enumeration-safe accepted message only after `accepted === true`. Reset Password requires a link token and `passwordReset === true` before reporting completion.

## Access and development isolation

After Login, `authenticatedPatientDestination()` obtains current server access status:

- Not authenticated: `#/login`.
- Patient with unverified email: `#/verify-email`.
- Verified patient without a linked medical file: `#/patient/file`.
- Verified patient with a linked medical file: `#/patient/dashboard`.
- Unknown/non-patient role or unknown linked-file status: no patient destination is fabricated.

Other role destinations need an agreed role-routing implementation; this module does not invent staff dashboards. Client routing does not replace server authorization of patient records.

In Vite DEV only, `App.jsx` connects normal Sign Up/Login/pending-verification navigation to the isolated frontend walkthrough. It validates and changes UI steps without creating sessions, accounts, verified-email flags or medical records. Real verification callbacks with tokens retain the actual controller. Production excludes this walkthrough. Credentials/tokens are not persisted in browser storage.

## Integration status and checks

`serviceTransport.js` currently throws `SERVICE_UNAVAILABLE`; no HTTP endpoint, email provider or session transport is configured there. UI errors are honest adapter failures. Backend account creation, mail delivery, verification, recovery, sessions and file association are not established by frontend tests.

See [API requirements](../../PATIENT_API_REQUIREMENTS.md) for current payloads, normalized results and pending backend decisions. Do not replace server confirmation with local flags or tokens.

From `Frontend`:

```sh
npm run test:auth
npm run test:i18n
node scripts/check-auth-module.mjs
node scripts/check-registration.mjs
node scripts/check-auth-module-browser.mjs
```

The browser check needs Chrome and DEV/production servers on `localhost:5173` and `localhost:4173`. It checks validation, visibility, verification/recovery failure paths, responsive English/Arabic UI and route protection; it is not proof of successful backend authentication or email delivery.
