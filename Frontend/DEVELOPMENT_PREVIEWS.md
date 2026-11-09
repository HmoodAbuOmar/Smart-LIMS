# Seamless development-only frontend flow

Run npm.cmd run dev from Frontend and open http://localhost:5173/ normally.
Get Started, Login, and the existing authentication tabs use the normal website
routes. No testing link, failed API request, or special URL is needed.

## Routes and navigation

In Vite development only:
- /#/signup validates account fields and opens /#/verify-email.
- /#/verify-email displays the entered email with pending status. Continue opens
  /#/login without claiming delivery or marking email verified.
- /#/login validates fields and opens /#/onboarding/file.
- File selection opens /#/onboarding/file/new or /#/onboarding/file/link.
- Validating either form opens /#/onboarding/dashboard, the existing patient portal with its original
  catalog, profile, order, appointment, result, notification, and history fixtures. No medical file is created or linked.

The original split-card design, language toggle, tabs, and portal are reused.
No development indicators, banners or temporary testing links are rendered.

## Back, Forward, and refresh

Normal Back controls and browser Back/Forward use hash navigation. Form entries
remain in memory across steps; passwords and file identifiers are discarded on
leaving their form. Refresh keeps the routed screen but clears all form values.
Back after refresh falls back to the preceding logical step. No account/contact
or medical data, credentials, tokens, or flow flags are stored in browser storage
or history state. Only the existing language preference is persisted.

## Isolation

The flow import and route handling are compile-time DEV-only. There is no
runtime query or storage flag that can activate it in production. The real
patient URLs /#/patient/* retain their unchanged guards in both environments.
Real email-verification callbacks containing a token use the actual verification
controller even in development. Production signup/login use their actual API
adapters and server-response requirements. Those adapters currently have no
implemented transport and fail closed. No API endpoints have been invented.

The isolated flow never calls authentication or patient-file APIs, creates
sessions, verifies emails, creates medical records, or injects fake responses.
Its dashboard uses only the original development fixtures and cannot expose actual patient data. Portal actions
keep their existing real adapter boundaries and unavailable-operation handling.

## Verification

Run npm.cmd run build, npm.cmd run lint, npm.cmd run test:auth,
npm.cmd run test:i18n, node scripts/check-registration.mjs, and
node scripts/check-preview-build.mjs.

With Vite on 5173 and npm.cmd run preview -- --port 4173 on 4173, run
npm.cmd run test:walkthrough:browser. It verifies both languages, both file paths,
validation, retained input, password disposal, browser Back/Forward, refresh of
every step, real token callbacks, protected patient routes, and production
exclusion. No real backend registration or email delivery is claimed.

The development portal retains its workspace in memory across navigation and
re-entry. Refresh regenerates the unchanged original fixtures; only selected
fixture test IDs and read-notification IDs are retained as tab UI preferences.
Typed personal/profile values and medical results are never stored. See
RESTORED_PORTAL_DATA.md for the data restoration report.

Booking refinement: development tab preferences now also retain only unfinished
fixture-based checkout selections (test IDs, date/time, method, request ID) and
the current portal page. Names, profile fields, clinical values, card details,
tokens and confirmed booking/payment states are not persisted.
