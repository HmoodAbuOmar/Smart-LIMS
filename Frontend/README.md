# Smart-LIMS frontend

Smart-LIMS is a React 19 / Vite 8 frontend for laboratory patients. It includes a Homepage, account authentication and onboarding screens, and a patient portal. English/LTR and Arabic/RTL use i18next and react-i18next. The existing interface shares teal/mint styling, the official Smart-LIMS logo, and Lucide icons.

## Current integration status

The UI, routing, validation, and isolated development interactions are implemented. Real authentication, email delivery/verification, patient medical files, authorized patient records, booking persistence, report retrieval, and payment processing still require backend/provider integration.

`src/services/serviceTransport.js` and the methods in `src/services/portalApi.js` currently reject with `SERVICE_UNAVAILABLE`; no HTTP transport is configured there. Production does not substitute fixtures or claim successful accounts, verification, bookings, or payments after failed operations. This describes frontend code, not backend service or deployment availability.

See [API requirements](PATIENT_API_REQUIREMENTS.md), the [authentication module](src/auth/README.md), and [hosted payment integration](HOSTED_PAYMENT_INTEGRATION.md).

## Setup

Use npm and Node.js satisfying the installed Vite engine constraint: `^20.19.0 || >=22.12.0`.

From the project root:

```sh
cd Frontend
npm ci
npm run dev
```

In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. Vite normally serves `http://localhost:5173/`. For browser tests, reserve the expected port explicitly:

```sh
npm run dev -- --host localhost --port 5173 --strictPort
```

For a production build and local production preview, use another terminal:

```sh
npm run build
npm run preview -- --host localhost --port 4173 --strictPort
```

Preview serves the built application; it does not enable the DEV walkthrough or provide backend services. `vite.config.js` sets `build.emptyOutDir: false` to preserve the user-owned reference at `dist/images/patient-portal-reference.png`. Builds retain existing output rather than clearing that directory. Generated output is not application source.

## Architecture

| Location | Responsibility |
| --- | --- |
| `src/main.jsx`, `src/i18n.js` | Initialize translations, document language/direction and saved language before rendering React. |
| `src/App.jsx` | Hash router, registration context, onboarding provider, lazy portal entry and compile-time DEV entries. No React Router dependency is used. |
| `src/Homepage.jsx` | Homepage using Navbar, ProductShowcase, BrandLogo and HomepageHealthChart. |
| `src/auth/` | Split-card account forms, email-link verification/resend, password recovery/reset, account API and access policy. |
| `src/components/PatientOnboarding.jsx`, `PatientFileStateProvider.jsx` | Patient-file selection/creation/linking, access checks and in-memory creation draft. |
| `src/portal/PatientPortal.jsx`, `PortalEntry.jsx` | Shared state/layout/sidebar/navigation and authenticated workspace loading. |
| `src/admin/patients/` | `AdminPatients.jsx` entry, patient form/avatar, scoped styles, model, local service, translations and feature checks. |
| `src/admin/catalog/` | `AdminTestCatalog.jsx` entry, parameter/range editors, scoped styles, model, local service, translations and feature checks. |
| `src/portal/booking/` | `BookingCheckout.jsx` entry, receipt, payment, review, appointments and rescheduling, plus booking components, styles, model and translations. `BookingFlow.jsx` retains the named exports. |
| `src/portal/history/` | `MedicalHistory.jsx` entry, visit archive, biomarker trends, measurement list, dashboard preview, scoped styles, model and translations. |
| `src/portal/pages/` | Other portal catalog, order, result, notification and profile pages. |
| `src/portal/components/`, `PortalContext.js`, `*Model.js` | Reusable controls, tables, dialogs, report download, validation and state helpers. |
| `src/services/` | Account, patient-file, workspace, booking and hosted-payment boundaries. |
| `src/dev/` | Isolated walkthrough, fixture workspace and browser-test harnesses; not real authentication. |
| `src/locales/`, `src/portal/*Copy.js` | Bundled English/Arabic resources. |
| `src/index.css`, `App.css`, `Hero.css`, `theme.css`, component CSS | Existing tokens, typography, responsive surfaces and component styles. |
| `scripts/` | Committed Node/model/rendering/browser checks. |

The logo is `public/images/smart-lims-logo.png`, shared through `BrandLogo.jsx`. Homepage chart measurements are illustrative marketing data, separate from the Medical History chart, which consumes the authorized patient workspace or isolated DEV fixtures. Homepage measurements are not actual patient records or clinical diagnoses.

Feature folders own their specific components, copy and styles. Admin layout/navigation stay in `src/admin/components/`; portal layout, context and shared state stay in `src/portal/`. Shared transport/payment boundaries remain in `src/services/`, and account forms remain in `src/auth/`. Routes, permissions, persistence and data contracts are unchanged by this organization.

## Routes and journey

Navigation uses fragments, for example `http://localhost:5173/#/login`.

| Route | Interface |
| --- | --- |
| `/` | Homepage; existing section anchors remain supported. |
| `/#/signup`, `/#/login` | Account registration and Login. |
| `/#/verify-email` | Email-link verification, resend and pending/error/expired/verified states. |
| `/#/forgot-password`, `/#/reset-password?token=...` | Reset-link request and new-password form. |
| `/#/patient/file`, `/#/patient/file/new`, `/#/patient/file/link` | File selection, creation and verified linking request. |
| `/#/patient/dashboard`, `/#/patient/profile` | Dashboard and profile. |
| `/#/patient/tests`, `/#/patient/tests/:id` | Catalog and test details. |
| `/#/patient/review` | Review selected tests. |
| `/#/patient/orders`, `/#/patient/orders/:id` | Orders and order details. |
| `/#/patient/book` | Appointment selection/review; `?order=:id` can select an existing order. |
| `/#/patient/book?reschedule=:id` | Existing appointment rescheduling. |
| `/#/patient/payment`, `/#/patient/booking-confirmation/:id` | Payment choice and confirmation/pending receipt. |
| `/#/patient/appointments`, `/#/patient/appointments/:id` | Appointments and booking details. |
| `/#/patient/results`, `/#/patient/results/:id` | Results and laboratory report. |
| `/#/patient/history`, `/#/patient/history/:visitId`, `/#/patient/history?view=trends` | Archive, visit details and trends. |
| `/#/patient/notifications` | Notifications with local read/unread state. |

The production sequence is registration -> backend email confirmation -> Login -> file selection when needed -> confirmed creation or verified linking -> Dashboard. Accounts and patient medical files are separate. Returning verified patients with linked files go directly to the Dashboard after access checks. Unknown/unauthorized access does not expose the portal. Client checks complement server authorization; they do not replace it.

## Isolated development flow

With `import.meta.env.DEV`, normal Get Started/Login controls automatically enter the existing frontend walkthrough. Validating Sign Up advances to pending email verification, Login, file selection, creation/linking forms and the original-fixture portal. This changes UI steps without creating accounts, verifying email, authenticating sessions or saving medical files. Real verification links with tokens still use the actual controller. Forgot/Reset Password retain their service/error behavior.

DEV routes are `/#/onboarding/file`, `/#/onboarding/file/new`, `/#/onboarding/file/link`, and `/#/onboarding/dashboard`. An optional fixture entry is `/#/__portal/dashboard`. Real `/#/patient/*` routes retain guards even in development. Production output excludes the DEV walkthrough and fixtures.

Form data stays in memory; passwords and linking identifiers are discarded when leaving their forms. Language uses `localStorage` key `smart-lims.language`. The DEV portal uses `sessionStorage` key `smart-lims.dev-portal.v1` only for fixture selections, read-notification IDs, unfinished checkout/UI preferences and page navigation. It does not persist entered profile details, clinical results, card values, credentials, tokens or completed-payment proof. Refresh regenerates original fixtures and restores only those preferences.

DEV profile/order/reschedule/cancel/notification actions can update the fixture workspace locally. New booking checkout still uses the unavailable booking adapters: it must not manufacture successful bookings or online payments. Missing integrations produce errors or neutral pending states.

## Localization and styling

`src/i18n.js` registers `common`, `landing`, `auth`, `showcase` and `portal`. Portal resources combine general, booking and history copy. English is the default/fallback; a saved valid language is restored. Switching updates document `lang`, `dir`, title and description without reloading. Shared components support RTL/LTR. `src/utils/currency.js` formats ILS with two decimals without converting stored prices.

Authentication uses the existing split card, CSS light decorations, boundary tabs and segmented language control, not a popup. Homepage and portal reuse the visual identity. IBM Plex Sans and Alexandria load through links in `index.html`, with CSS fallbacks.

## Available checks

Run from `Frontend`:

| Command | Scope |
| --- | --- |
| `npm run build`, `npm run lint` | Compilation and linting. |
| `npm run test:auth` | Account validation. |
| `npm run test:i18n` | Resource parity, rendering, language persistence, RTL/LTR and metadata. |
| `npm run test:portal` | Portal validation/reducer behavior and resource parity. |
| `npm run test:booking` | Checkout state, failures and duplicate prevention. |
| `npm run test:history` | Eligible visits, compatible series, ranges and laboratory flags. |
| `npm run test:hosted-payment` | Hosted-field/processor/server boundaries using test adapters. |
| `npm run test:patient-facing` | Rendered copy, fixture filtering and pending/confirmed response handling. |
| `npm run test:walkthrough:browser` | Visible Next/Back journey, validation, refresh and production isolation. |
| `npm run test:restored-data:browser` | Original fixture records, portal interactions and guards. |
| `npm run test:health-charts:browser` | Independent Homepage/archive charts. |
| `npm run test:patient-facing:browser` | Patient/auth/payment interactions and responsive checks. |
| `npm run test:portal:browser`, `npm run test:booking:browser`, `npm run test:history:browser` | Aliases of the same patient-facing browser suite above. |

Additional committed checks:

```sh
node scripts/check-auth-module.mjs
node scripts/check-registration.mjs
node scripts/check-currency.mjs
node scripts/check-preview-build.mjs
node scripts/check-auth-module-browser.mjs
node scripts/check-favicon.mjs
```

Build before `check-preview-build.mjs`. Browser suites require Chrome, DEV on `localhost:5173` and production preview on `localhost:4173`. They share Chrome debugging port `9337` and must run serially. The default executable is the Windows Chrome path; set `CHROME_PATH` for another installed Chrome. Tests create temporary profiles and may create downloads/screenshots. Do not set `REGENERATE_FAVICON=1` for verification-only runs: that optional mode rewrites favicon assets.

Passing these checks establishes frontend behavior and boundaries, not real account creation, email delivery, patient ownership/linking, durable records, live laboratory availability or charged payments. Those need agreed contracts and end-to-end tests with configured services.
