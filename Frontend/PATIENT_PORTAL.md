# Smart-LIMS patient portal implementation

## Run and explore

From `Frontend`, run `npm.cmd run dev` (PowerShell), then open
`http://localhost:5173/`. The existing Get Started / Login buttons enter the
development-only account/onboarding walkthrough. Completing either patient-file
path opens the complete sample portal. No manual page URLs are necessary.

An optional direct development entry is `http://localhost:5173/#/__portal/dashboard`.
It is compiled out of production. Within the normal walkthrough, portal page
transitions remain in React state; its Back breadcrumb returns to the file form.
Logout discards the workspace and returns to development Login, never a real session.

## Reference and visual implementation

The supplied `dist/images/patient-portal-reference.png` was inspected before coding.
Its sidebar/topbar arrangement, dashboard structure, mint cards, table treatments,
two-column details/profile/booking screens, report structure, and notification rows
guide the implementation. Existing medical teal tokens, typography, official PNG,
shared field colors, and Arabic/EN toggle are reused. Authentication CSS, markup,
forms, logos, and animations were not redesigned.

Reference SHA-256 before and after building:
`B266BA8930957406BE199DD4332E4C63E196DF80ED048402738A3FDBDF9B176C`.
Vite `build.emptyOutDir` is false to preserve this user-owned file in its exact
location. Builds intentionally retain prior versioned assets too. No image is
used as a portal page background or substituted for React UI.

## Pages and routing

| Page | Protected route | Completed frontend behavior |
|---|---|---|
| P01 Dashboard | `#/patient/dashboard` | Linked summary cards, recent orders, next appointment, latest results, popular tests, quick actions |
| P02 Complete Profile | `#/patient/profile` | Existing profile editing, personal/contact fields, progress, validation, save/cancel |
| P03 Tests Catalog | `#/patient/tests` | Name search, categories, empty state, details, cart selection/count |
| P04 Test Details | `#/patient/tests/:id` | Test-specific description, sample, preparation/fasting, processing time, reference explanation, add to order |
| P05 Review Order | `#/patient/review` | Selected tests/prices/total, remove/add more, patient summary, sample confirmation |
| P06 My Orders | `#/patient/orders` | Status tabs, identifier search, dates/counts/prices, details |
| P07 Order Details | `#/patient/orders/:id` | Four-stage timeline, collection/processing state, tests, published-result actions |
| P08 Book Appointment | `#/patient/book` | Visible month calendar and date input, time slots, type/order selection, summary, validation, sample confirmation |
| P09 My Appointments | `#/patient/appointments` | Upcoming/past lists, cancellation modal, rescheduling prefilled booking |
| P10 My Results | `#/patient/results` | Search/category/status filters; unpublished view/download disabled |
| P11 Lab Result Report | `#/patient/results/:id` | Patient/order/sample/report details, values/units/ranges/flags, sample watermark, PDF download and print |
| P12 My Notifications | `#/patient/notifications` | All/unread/category filters, read actions/counts, related-page navigation |

Development direct routes use `#/__portal/` instead of `#/patient/`. Existing
`#/patient/file`, `/file/new`, and `/file/link` onboarding routes keep their
existing guards and forms. Real Login returning-user destinations are unchanged.
The portal sidebar mirrors in Arabic; mobile navigation is collapsible. Search in
the topbar opens filtered catalog results. The account menu contains Profile and Logout.

## API reality and isolation

No real authentication or patient API transport is configured in this checkout.
`patientApi` rejects with `SERVICE_UNAVAILABLE`; no endpoint, CORS response, email
delivery, secure link, or real clinical report can be verified. No existing API was
replaced with mock success. No backend files were edited.

Production entry checks `patientApi.getAccess()` and the existing
`patientDestination()` policy. Only an authenticated patient with verified email
and a linked medical file can proceed. Missing/unknown access fails closed. It
then requires `portalApi.loadWorkspace()`; that adapter also explicitly rejects
until a real transport is provided. There is no sample fallback after an API error.

`dev/portalSampleData.js` and `dev/DevelopmentPortal.jsx` are reachable only from
compile-time DEV branches. Tests verify production assets contain no sample
identifiers, fixture emails, or development route strings. Sample state is held
only by React's reducer. Cart, orders, profile edits, appointment changes, and read
statuses disappear on reload/logout. No tokens, passwords, or medical records are
stored in localStorage/sessionStorage/IndexedDB. The existing language preference
remains the sole persisted setting. Mock operations make no network submissions.

A translated workspace notice identifies development data. Confirmation wording
explicitly says sample. Availability is identified as sample, and published sample
reports carry a permanent NOT FOR CLINICAL USE watermark in HTML, print, and PDF.
No clinical interpretation is generated. PDF download creates a valid single-page
PDF from a Unicode-capable canvas rendering; this avoids new dependencies and
supports Arabic text. Production never uses this generator for actual medical data.
The print action invokes the browser dialog; browser tests check the invocation and
print media styles, not a physical printer.

## Backend integration still required

`src/services/portalApi.js` names frontend operations without inventing URLs,
database columns, or final request contracts. The backend team must publish the
following authenticated, patient-owned operations and schemas:

1. Session/access and logout; email verification, registration/login/recovery,
   new-file association, and verified existing-file linking remain required too.
2. Workspace/profile read, profile update, and definitive required field rules.
   Existing patient fields are name, date of birth, gender (male/female), phone.
   Email belongs to account/contact data. Address is an optional local UI draft,
   not a claimed database field. National ID/passport and medical history are not
   sent because no contract/model defining them exists here.
3. Catalog/search, stable test/category identifiers, authoritative prices,
   preparation instructions, and processing times.
4. Patient-owned order create/list/detail with server-calculated totals,
   idempotency/duplicate-submit protection, and laboratory progress timestamps.
5. Live availability, timezone policy, appointment book/list/reschedule/cancel,
   atomic conflict checks, and related-order ownership verification.
6. Authorized results listing/detail, explicit publication status, verified values,
   units/reference ranges, and securely generated official PDF download.
7. Notifications list/read/all-read with timestamps and authorized related objects.

Replace the rejecting service operations with the confirmed transport, map its
responses to the UI view models, and connect production mutations in `commit()`.
Do not enable a production action by returning development fixtures. Handle session
expiry/403 and enforce ownership/publication on the server for every operation.
No protected clinical information should depend on frontend filtering alone.

## Verification

Latest validation (2026-10-26): production build, lint, authentication validation,
existing localization tests, portal model/translation tests, registration/access
policy checks, production fixture-exclusion scan, original onboarding browser
regressions, and the full 12-page browser suite all passed. Console errors were
checked. Screenshots of English/Arabic desktop/mobile pages were visually reviewed.
No real backend account, email, order, appointment, linking or report operation was
verified; the required transports do not exist in this checkout.

Commands (run from `Frontend`):

```text
npm.cmd run build
npm.cmd run lint
npm.cmd run test:auth
npm.cmd run test:i18n
npm.cmd run test:portal
node scripts/check-registration.mjs
node scripts/check-preview-build.mjs
```

For browser checks, run dev on port 5173 and `npm.cmd run preview -- --port 4173`
in another terminal, then:

```text
npm.cmd run test:portal:browser
node scripts/check-development-preview.mjs
```

Browser checks use installed Chrome (`CHROME_PATH` overrides its location).
`AUTH_TEST_SCREENSHOTS=1` saves screenshots to a temporary folder. The suite visits
all 12 pages in English and Arabic at 320/768/1440px and tests visible-button
navigation, cart/order changes, validation, calendar/slots, reschedule/cancel/modal
actions, publication gating, PDF bytes/download, print invocation, notification
state, profile changes, mobile sidebar, no API POSTs or sensitive storage, real
route access denial, and production development-route exclusion.

## Files in this implementation

Created: `src/portal/PatientPortal.jsx`, `Portal.css`, `PortalEntry.jsx`,
`portalCopy.js`, `portalModel.js`, `sampleReport.js`; `src/dev/DevelopmentPortal.jsx`,
`portalSampleData.js`; `src/services/portalApi.js`; `scripts/check-portal-model.mjs`,
`check-patient-portal.mjs`; this document.

Updated: `src/App.jsx`, `src/i18n.js`, `src/dev/PatientPreview.jsx`,
`scripts/check-development-preview.mjs`, `scripts/check-registration.mjs`,
`scripts/check-preview-build.mjs`, `package.json`, `vite.config.js`,
`DEVELOPMENT_PREVIEWS.md`. Existing uncommitted files and dependencies were preserved.
