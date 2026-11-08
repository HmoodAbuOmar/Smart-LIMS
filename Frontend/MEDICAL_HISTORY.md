# Medical history, visit archive, health trends and logo consolidation

## Navigation and behavior

The shared patient sidebar now contains Medical History / سجلي الطبي.
`#/patient/history` shows a newest-first timeline; `#/patient/history/:visitId`
opens the exact visit; `#/patient/history?view=trends` opens the trends section.
These routes use the existing patient access guard. Isolated development uses
the existing `#/__portal/` equivalents, including the normal onboarding journey.

Visit cards expand to show the visit date/time, appointment and order references,
tests/results, units, applicable ranges, laboratory flags, payment status, amount
paid when supplied, and report/download actions. Unknown paid amounts are not
inferred from order totals. Search, date range, test and result-status filters
operate locally on the authorized workspace. A visit can contain both high and
low results; abnormal-status filters match the applicable row flags. Its summary
prioritizes critical, high, low, then unclassified. A Normal filter requires all
classified visit results to be normal.

Dashboard includes a miniature trend card. Results and individual reports link to
their exact visit; Orders, order details, completed appointments and Profile also
link to the archive. Confirmed, cancelled, future, incomplete, unverified or
unpublished encounters do not become completed visits. A paid development booking
does not by itself create medical history. Visits derive from current workspace
appointments/orders/results, so no second duplicate archive store is maintained.

## Chart integrity and accessibility

The dark teal chart card follows the requested visual specification: mint curves,
round points, subtle horizontal grid lines, prominent latest value, date, previous
value, absolute/percentage change, count, and applicable reference information.
Select a compatible biomarker series and 3/6/12 months or all time. The dashboard
miniature opens this same section. The new chart image mentioned in the request
was not present as an attachment; the detailed chart description and the existing
`dist/images/patient-portal-reference.png` guided the implementation. That reference
file remains in its original location and unchanged.

Series are keyed by biomarker ID + exact unit + method ID + specimen. No conversion,
averaging, diagnostic threshold or missing value is invented. Results lacking a
known measurement timestamp/method/unit/specimen/biomarker are not charted.
Non-numeric or qualified values (for example `<5`) remain in reports but are not
turned into numerical measurements. Future measurements are excluded. Each SVG
curve segment stays between its two measured endpoints; the chart is not a
forecast. The X-axis uses measurement timestamps, not evenly-spaced visit indexes.

Tooltips include biomarker, date, value, unit, reference range and linked visit.
Points support pointer, touch, keyboard focus, Enter/Space, and left/right arrow
navigation. Narrow charts show fewer date labels and keep actual font sizes via a
ResizeObserver. Empty periods show a message and dashes, never invented zeros;
one-point series show no calculated change. Percentage change is omitted for zero
or negative previous values. Decreases/increases use neutral styling, not automatic
improvement/deterioration labels. Reduced-motion preferences are respected by the
existing shared portal rules.

Prominent measurements and tooltips preserve the laboratory's provided numeric
text/precision. Grid labels and calculated comparisons use readable significant
digits rather than changing the source values.

Understanding Your Results contains short English/Arabic test descriptions, the
latest laboratory classification/range, and an informational-only disclaimer.
Critical is displayed only for an explicitly flagged, verified laboratory critical
classification (`criticalVerified: true`); it is never calculated from a generic
cutoff. No diagnosis or medication recommendation is generated.

Definitions were checked against and link to MedlinePlus (US National Library of
Medicine):

- https://medlineplus.gov/lab-tests/hemoglobin-test/
- https://medlineplus.gov/lab-tests/vitamin-d-test/
- https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/
- https://medlineplus.gov/lab-tests/creatinine-test/
- https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/
- https://medlineplus.gov/lab-tests/cholesterol-levels/
- https://medlineplus.gov/lab-tests/triglycerides-test/

## Development data and production requirements

`src/dev/historySampleData.js` adds six clearly identified SAMPLE visits (the recent
published sample order plus five earlier visits) to the isolated development
workspace. Repeated series cover hemoglobin, vitamin D, TSH, HbA1c, creatinine,
total cholesterol, LDL, HDL and triglycerides. Separate creatinine units and TSH
methods intentionally exercise non-combination. Fasting glucose is not added as a
new catalog test because no corresponding frontend/backend test contract exists.
Fixture reference ranges and classifications are illustrative, not universal
clinical ranges. History and the miniature card identify sample medical data;
downloaded/printed reports retain their sample watermark. No clinical record is
written to localStorage/sessionStorage/IndexedDB. Only the existing language
preference persists. Reload/logout discards all sample state.

Production still has no configured patient API transport. There is no fallback to
sample history after an API failure. Extend the existing authenticated
`portalApi.loadWorkspace` normalization when authoritative contracts are supplied;
no new backend URL, model, database column or controller was invented here.
The frontend view model requires:

- An authorized profile file number, and matching canonical `patientId` on the
  appointment, order and result. Missing/mismatching ownership is excluded.
- Completed appointment status with actual date/time, stable visit and appointment
  IDs, and an explicit order link; completed order status with owned test IDs.
- Published, verified (`verified: true`) report, explicitly linked to that same
  appointment and order, report date, values, and measurement timestamp.
- Stable biomarker ID, numerical value, exact unit, method ID/display name, specimen,
  and the laboratory's patient/method-specific reference bounds/unit or range text.
- Validated normal/high/low flags and explicit verified critical flags when defined
  by the laboratory; optional stable measurement IDs for repeated rows.
- Authoritative payment status and amount actually paid in ILS; no client-side
  assumption that a completed visit was fully paid.
- Secure, patient-owned, publication-gated report downloads. The current sample
  generator must not generate real clinical reports.

The server must enforce ownership and publication on every read/download. Client
checks are additional display safeguards, never backend authorization. When
completion/verification events update the authorized workspace, selectors include
the visit automatically. Real refresh/push delivery and persistent medical archives
remain backend integration work; no real records or live events were verified.

## Logo audit

The approved asset is the existing transparent `public/images/smart-lims-logo.png`,
already approved in the authentication/sidebar white treatment. No source logo was
redrawn, recolored on disk, replaced with another illustration, or generated.
`BrandLogo.jsx/.css` centralizes that same PNG and the existing white CSS treatment.
The obsolete ECG/text header/footer and generic flask/text product-showcase marks
were replaced. Authentication keeps its existing container positioning and sizing;
the portal sidebar and all its pages share the same component. The report header
uses a dark teal backing for the white logo, and sample PDFs draw that same artwork.
Functional test/status/chart icons were not mistaken for logos or removed.

The existing approved flask favicon (`favicon.svg` and `favicon-smart-lims.png`)
and its cache-versioned references already use the current approved asset and were
retained. Inactive backups and historical build artifacts were not deleted.

## Changed frontend files

Created: `src/components/BrandLogo.jsx`, `BrandLogo.css`;
`src/portal/MedicalHistory.jsx`, `MedicalHistory.css`, `historyModel.js`,
`historyCopy.js`; `src/dev/historySampleData.js`; `scripts/check-history-model.mjs`,
`check-medical-history.mjs`; this document.

Updated: `src/App.jsx`; `src/components/AuthModal.jsx`, `ProductShowcase.jsx`;
`src/portal/PatientPortal.jsx`, `portalCopy.js`, `sampleReport.js`;
`src/dev/DevelopmentPortal.jsx`; `package.json` (test scripts);
`scripts/check-booking-flow.mjs`, `check-patient-portal.mjs`,
`check-preview-build.mjs`. Existing uncommitted changes were preserved.

## Verification commands

Validated on 2026-10-26: build/lint, history/portal/booking/authentication models,
currency/localization/access-policy tests and production fixture exclusion passed.
The history suite, all-12-page portal suite, booking/payment suite, original
onboarding suite, and favicon/title suite passed in English and Arabic. Responsive
checks covered 320/768/1440px; representative screenshots were visually reviewed.
No real backend medical records, clinical verification events or persistent archive
operations were available to test. The chart attachment described in the request
was absent; the described specification and existing portal reference were used.

From Frontend:

```text
npm.cmd run build
npm.cmd run lint
npm.cmd run test:history
npm.cmd run test:portal
npm.cmd run test:booking
npm.cmd run test:auth
npm.cmd run test:i18n
node scripts/check-currency.mjs
node scripts/check-registration.mjs
node scripts/check-preview-build.mjs
```

With dev on 5173 and production preview on 4173:

```text
npm.cmd run test:history:browser
npm.cmd run test:portal:browser
npm.cmd run test:booking:browser
node scripts/check-development-preview.mjs
node scripts/check-favicon.mjs
```

The history suite tests chronological archive/filters/details/reports, exact visit
cross-links, compatible-unit/method separation, biomarker/time switching, keyboard
tooltips, single/no-measurement states, approved white logos, protected routes,
English/Arabic at 320/768/1440px, and no sensitive storage or fake API writes.
`AUTH_TEST_SCREENSHOTS=1` saves review screenshots in a temporary folder.
