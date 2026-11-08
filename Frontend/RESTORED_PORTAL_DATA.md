# Original development data restoration

## Cause identified before editing

The copy-cleanup changes disconnected `createPortalSampleData` and
`addHistorySamples`: `DevelopmentPortal` started with `emptyPatientWorkspace`.
In addition, `PatientPortal` always ran `patientFacingWorkspace`, stripping the
original SAMPLE profile, orders, appointments and results and then clearing
notifications. Reconnecting the factory alone would therefore not restore data.
Neither search/category filters nor backend availability caused these empty pages.
No original fixture files were deleted or changed by this fix.

## Original sources restored

- `src/dev/portalSampleData.js`: original seven tests with unchanged bilingual
  descriptions, categories and prices, patient profile, four orders, two
  appointments, four result entries and four notifications (three unread).
- `src/dev/historySampleData.js`: original five historical orders, six completed
  appointments, thirty additional reports, verification/ownership associations
  and biomarker series. Combined workspace: nine orders, eight appointments,
  thirty-four reports, six completed medical visits. Dashboard counts initially
  match nine orders, one upcoming appointment, thirty-three published reports,
  three unread notifications.
- `src/portal/sampleReport.js`: existing explicitly watermarked PDF exporter,
  used only for development fixture reports, never production report delivery.

All original fixture records are present. No replacement clinical values,
prices, identities, or visit records were invented.

## Isolation and state

The development entry explicitly supplies `development` to the existing portal.
Only Vite DEV permits this initializer to retain fixture records. Production
still uses the unchanged sample-filtering initializer and authenticated routes.
No authentication service, session, token, endpoint or backend file was changed.

`portalWorkspace.js` retains the workspace across navigation, onboarding Back,
and portal re-entry within the tab. Refresh rebuilds the same original fixture
dataset. Tab session preferences retain only selected fixture test IDs and
read-notification IDs under `smart-lims.dev-portal.v1`; no credentials, entered
profile data or medical results are persisted. Typed profile edits remain in
memory. Existing storage keys are not deleted or reset.

Original reducer interactions are restored only in the isolated workspace:
profile editing, local order review, appointment rescheduling/cancellation,
notification reads and test selection. Newly requested bookings/payments still
use neutral pending states when real adapters cannot confirm them; this data
restoration does not fabricate a processed transaction or alter real APIs.

## Files changed for this restoration

- `src/dev/DevelopmentPortal.jsx`
- `src/dev/portalWorkspace.js` (new)
- `src/portal/PatientPortal.jsx`
- `scripts/check-restored-data.mjs` (new)
- `scripts/check-development-preview.mjs`
- `scripts/check-medical-history.mjs`
- `scripts/check-patient-facing-browser.mjs`
- `package.json`
- `DEVELOPMENT_PREVIEWS.md`, `AUTH_FLOW_DIAGNOSIS.md`, `PATIENT_FACING_COPY.md`
- `RESTORED_PORTAL_DATA.md` (this report)

No CSS, layouts, theme files, logo assets, original fixtures or backend files
were modified. Existing uncommitted work was preserved.

## Verification

`npm run test:restored-data:browser` checks original counts, dashboard statistics,
catalog search/categories/details, order statuses, appointments, results/report,
profile, archive, notification reads, cart selections, pending laboratory/online
checkout, refresh and protected real routes in both languages and at mobile,
tablet and desktop widths. `node scripts/check-medical-history.mjs` exercises
visit filters/order/details, all trend controls, unit/method separation, keyboard
tooltips, linked-page navigation and actual sample PDF downloads. The existing
walkthrough test covers both onboarding paths, Back/Forward and screen refresh.
These require dev/production preview servers on ports 5173/4173 respectively.

Build/lint, portal/booking/history/auth model tests and production fixture-exclusion
checks remain separate. No real backend registration, payment, booking, or medical
operation is claimed to have succeeded.

Later booking refinement: unfinished fixture-based checkout selections and portal
page are retained as tab UI preferences as well. This never restores a paid or
confirmed state from storage. See FINAL_BOOKING_REPORT.md.
