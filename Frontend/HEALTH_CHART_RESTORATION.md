# Independent homepage and Medical Archive charts

## Original regression

The earlier wording cleanup replaced the homepage measurement expression with
`const values = []`, replaced its latest value with a dash, and replaced the
change indicator with the pending-results message. This removed all plotted
points and connecting lines. The archive did not need the homepage emptied.

Git history was checked: HEAD contains only the initial React starter, not the
working homepage chart. Two existing backups agree on the original implementation:

- `Frontend-backups/Frontend-20261017-180419-b02707e4/Frontend/src/App.jsx`
- `Frontend-backups/Frontend-20261017-173725-493f5fde/Frontend/src/App.jsx`

## Homepage restored first

`HomepageHealthChart.jsx` restores the original chart markup/classes, geometry,
units, latest values, comparison calculation, metric tabs and time selector.
The recovered data is unchanged:

| Metric | Period | Original values (mg/dL) |
|---|---|---|
| Glucose | 6 months | 108, 101, 104, 94, 98, 92 |
| Glucose | 12 months | 105, 107, 100, 98, 95, 92 |
| Cholesterol | 6 months | 194, 188, 191, 179, 181, 172 |
| Cholesterol | 12 months | 198, 192, 187, 181, 177, 172 |

No arbitrary measurements were generated. This is the original public homepage
chart data, independent of any authenticated patient's medical records. Existing
translation files and homepage styles remain unchanged. Accessible chart labels
use existing translated metric/period/unit labels and the recovered measurements.

## Separate archive chart

The existing Medical Archive chart remains in `MedicalHistory.jsx`, using only
`medicalVisits` and `measurementSeries` from the existing patient history model.
It now also includes a detailed measurement list with dates, analyte, value,
unit, reference range, status, and links to the exact report and visit. Selecting
a catalog test without compatible history shows an empty state for that test;
switching back restores the selected populated analyte. Time filters affect the
archive graph and list together.

Only completed owned visits and verified published numerical results enter the
series. Analyte, units, method and specimen remain separate. There is no import,
state or shared dataset between the homepage component and the archive chart.
The original fixture files and patient dashboard chart are unchanged.

Existing archive fixtures contain cholesterol, hemoglobin, HbA1c, vitamin D,
TSH, creatinine, LDL, HDL and triglycerides. They contain no blood-glucose
history. No homepage glucose values were copied into patient records to fill
that gap.

## Verification

`npm run test:health-charts:browser` checks all four exact homepage series,
six plotted points/connected lines, displayed values and comparisons, both tabs
and periods, Arabic/English, desktop/tablet/mobile, archive analyte/time switching,
measurement list/report navigation, test-specific empty states, and independence
after navigating between charts. `node scripts/check-medical-history.mjs` checks
archive visits, trend tooltips/keyboard controls, unit/method isolation, PDFs and
protected routes. Neither browser test submits data or modifies fixtures.

## Modified files

- `src/App.jsx` — mount dedicated homepage chart; remove only its old inline state/markup.
- `src/components/HomepageHealthChart.jsx` — new component recovered from backups.
- `src/portal/MedicalHistory.jsx` — archive measurement list and test-specific empty selection.
- `src/portal/MedicalHistory.css` — existing 22px spacing for the new list only.
- `scripts/check-health-charts.mjs` — new bilingual/browser regression checks.
- `package.json` — test command only.
- `HEALTH_CHART_RESTORATION.md` — this report.

No authentication, dashboard, catalog, booking/payment, profile, notification,
navigation, translation, backend or fixture source changes. No commits or pushes.
