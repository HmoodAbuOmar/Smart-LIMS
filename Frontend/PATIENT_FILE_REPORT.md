# Patient-file onboarding implementation and login-error diagnosis

## Scope

Worked on `munafront`, frontend only. Backend inspected read-only. No commits,
pushes, dependencies, backend changes or changes to the approved authentication
stylesheet/logo assets. The homepage content is unchanged.

The existing card shell is exported as `AuthLayout` and reused without changing
its markup/design: dark teal branding, light mint form surface, logo, language
switcher, animated lights and boundary tabs. The only new CSS styles the requested
patient option icons/actions and is scoped to the patient-file choices.

## Three completed frontend screens

| Route | Content and navigation |
| --- | --- |
| `/#/patient/file` | Requested Arabic/English title/subtitle, Folder Plus and Link icons, two separate option cards and turquoise navigation actions. |
| `/#/patient/file/new` | Full name, date of birth, male/female gender, phone, required-field/calendar/phone validation, creation action and Back to file selection. No password or account registration fields. |
| `/#/patient/file/link` | Existing patient file number, required validation, Verify and link action and Back to file selection. No identifier is treated as verified locally. Additional identity controls require the actual backend contract. |

Every production patient route remains protected by the server-session and
email-verification checks. A verified linked patient is sent to the dashboard
destination. Successful creation/linking must be confirmed, followed by a fresh
verified linked-file session check. No private records, successful linking or
dashboard data are fabricated. No dashboard exists in this checkout to replace.

## Backward navigation and privacy

Creation entries remain in React state while navigating among the three
onboarding routes. They are scoped to a stable userId from the real session API.
Returning to creation from selection restores the values; validation messages
start fresh. No clinical results, passwords or linking identifiers are cached.
The linking identifier is local to its form and clears on leaving it.

Creation entries clear when leaving onboarding (including Login/dashboard), when
the session identity changes/is missing, on failed/denied access checks, and on a
restored browser history page. Refresh/unmount also discards memory. No patient
information is written to localStorage, sessionStorage or browser databases.
The existing language preference remains the only persisted preference.

## Exact cause of current Login / Sign Up errors

`src/services/patientApi.js` exports `requestPatientOperation`. For every recognized
operation it currently constructs and throws an error with code
`SERVICE_UNAVAILABLE`, before any HTTP request. The shared form handler catches
that rejection and displays the short translated error. This is the direct cause
of both Arabic messages reported by the user.

- No API base URL or environment mapping was found.
- Vite config contains the React plugin only; there is no backend proxy.
- No registration/login endpoint paths are configured in the transport.
- No request is sent, so there is no HTTP status, preflight or observed CORS
  response responsible for these messages. CORS behavior cannot be verified
  without a real URL and a functioning backend contract.
- Read-only backend inspection found only the Spring Boot entry class, basic
  application-name config and generated test, with no auth controllers, user or
  patient models, mail service or linking APIs. Backend reachability at an external
  deployment is unknown because no deployment URL was supplied.
- Proposed frontend account payload is `{fullName,email,password}`; login payload
  is `{email,password}`. Confirmation passwords are excluded. Medical payload is
  separate `{fullName,dateOfBirth,gender,phoneNumber}`; linking starts with
  `{fileIdentifier}`. Their compatibility cannot be verified against absent APIs.

The errors were not hidden or converted to success. The transport still fails
honestly. No guessed endpoint is called and no backend configuration was changed.

## Existing and missing integrations

**Functional existing HTTP integrations: none.** Reusable account, session,
verification/recovery, createFile and linkFile service interfaces already exist.
They remain unavailable until connected to real backend endpoints.

Missing contracts/services include registration/login, email delivery and
verification, authoritative session data including userId/verified-email/linked-file
status, actual patient schema, transactional file creation/account association with
duplicate prevention, and secure existing-file ownership verification/linking.
The actual patient dashboard/data API is also absent. Patient identification alone
must never authorize linking; no extra verification fields were guessed.

See [PATIENT_API_REQUIREMENTS.md](./PATIENT_API_REQUIREMENTS.md) for proposed
operation contracts and required backend security checks. Those proposed paths
are not existing endpoints or configured requests.

## Verification and limits

- Production build, lint, existing auth validation, localization and workflow
  policy/rendering checks pass.
- Isolated component browser checks cover all three screens in English/Arabic at
  320, 390, 820 and 1280px: icon rendering, card links, field order/types, validation,
  male/female-only gender, backward creation-value retention, identifier clearing,
  unavailable service errors, no false success, no horizontal overflow and no tabs
  blocking input fields. Screenshots were captured for visual review.
- The component-check server mounts the real presentation components without
  creating an account/session, injecting successful API results or changing the
  production route guard. It runs only from a test script and is never a product
  route or a preview control.
- The application browser checks independently verify that protected routes stay
  closed without confirmed server access, that Login/Sign Up fail honestly, and
  that verification, recovery, RTL/LTR, tabs and reduced-motion behavior remain
  intact. No guessed POST request, stored password/token or browser exception is
  accepted by the tests.
- Real login, authenticated screen access, record creation/linking, CORS/session
  behavior and dashboard data cannot be tested end-to-end without the real API.
  Component checks are not a claim of successful backend integration.

Commands from Frontend: `npm.cmd run build`, `npm.cmd run lint`,
`npm.cmd run test:auth`, `npm.cmd run test:i18n`,
`node scripts/check-registration.mjs`,
`node scripts/check-patient-file-screens.mjs` (starts its own isolated local server).
For `node scripts/check-registration-browser.mjs`, first start
`npm.cmd run dev -- --host 127.0.0.1`. Browser checks use installed Chrome; no new
package is required. `AUTH_TEST_SCREENSHOTS=1` enables temporary screenshots.

## Modified frontend files

- `src/App.jsx`
- `src/components/AuthModal.jsx` (shared layout extraction; Login/Sign Up design unchanged)
- `src/components/PatientOnboarding.jsx`
- `src/components/PatientOnboarding.css` (new, patient-only styles)
- `src/components/PatientFileStateProvider.jsx` (new)
- `src/utils/patientFileState.js` (new)
- `src/services/onboarding.js`
- `src/locales/en/auth.json`
- `src/locales/ar/auth.json`
- `scripts/check-registration.mjs`
- `scripts/check-patient-file-screens.mjs` (new)
- `PATIENT_API_REQUIREMENTS.md`
- `registration.md`
- `PATIENT_FILE_REPORT.md` (this document)
