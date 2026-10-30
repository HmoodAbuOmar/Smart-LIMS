# Patient Dashboard API

Status: DONE, 2026-10-30. Final isolated full wrapper suite: 385 tests/51 suites,
zero failures/errors/skips. [Verification and limits](TESTING.md#patient-dashboard-verification-2026-10-30).

Task DASH-37; requirements DASH-R01-R06. References: the three local
patient-dashboard screenshots, PATIENTS_API.md, LAB_TESTS_API.md, ORDERS_API.md,
APPOINTMENTS_API.md, RESULTS_API.md, VISITS_API.md and MEDICAL_HISTORY_API.md.

## Read contract

`GET /api/patients/me/dashboard`, PATIENT only. No query parameters or patient
selector; unknown/repeated parameters return 400 VALIDATION_ERROR. Missing or
ineligible authentication returns 401; staff return 403. An unlinked account
returns 404 PATIENT_PROFILE_NOT_LINKED, without creating/linking a profile.
Use the existing create-profile or staff-assisted single-use linking flows.
Display name comes from the linked patient fullName, independently of account name.

200 JSON, Cache-Control: no-store. Safe repeatable GET, no idempotency key or
side effects. One read-only REPEATABLE_READ snapshot covers counts and previews;
`asOf` is the shared appointment cutoff and `timeZone` is Asia/Jerusalem. Instants
are UTC; local appointment fields include the actual DST offset. Dates on result
cards are publication dates in this zone, trend dates are measurement dates.

Response fields:

| Field | Meaning / ordering / limit |
|---|---|
| patientId, displayName | Real linked profile UUID and fullName. |
| asOf, timeZone | Response instant and laboratory display timezone. |
| totalOrders | All owned orders, including CANCELLED; independent of preview limit. |
| upcomingAppointmentCount | Owned CONFIRMED appointments with startsAt strictly after asOf; same definition as UPCOMING list. |
| currentPublishedResultCount | Owned current PUBLISHED versions, one per order item; includes retained publications on cancelled orders. Excludes working, approved and superseded versions. |
| notifications | `{available:false,unreadCount:null}`. Unavailable is never zero; notification actions remain deferred. |
| recentOrders | Up to 3 `{order,visits}` rows. `order` is the existing OrderSummaryResponse, createdAt descending then UUID ascending. `visits` contains actual `{id,visitNumber,visitUrl}` references, arrivedAt descending then UUID ascending. All actual visits are navigable, independently of order completion/publication. |
| nextAppointment | Existing appointment Detail DTO for earliest upcoming startsAt then UUID ascending; null if absent. Includes id/orderId/slotId/typeId, retained type name, timezone/date/time/offset/status/action fields. |
| latestResults | Up to 3 `{resultId,orderItemId,orderId,orderNumber,labTestId,testCode,testName,publishedAt,publicationDate,resultUrl,reportUrl}`. Current PUBLISHED only, publishedAt descending then result UUID ascending; ordered-test snapshots supply names/codes. Publication order is intentionally independent of result-list order. |
| catalogSuggestions | Up to 4 existing LabTestResponse DTOs, active only, name then UUID ascending (same as catalog). Deterministic catalog suggestions, no popularity/clinical/AI inference. Includes real test IDs, current prices/currency and preparation data. |
| healthTrendPreview | Null without eligible numeric history. Otherwise `{series,latest,chartData}` reuses existing Series/Measurement DTOs. Choose the compatible series with latestMeasuredAt descending then seriesId ascending, return its latest up to 6 points ascending by measuredAt/orderItemId/valueId (lexical UUID ties). `series.measurementCount` covers the complete series. |

Trend compatibility is exactly MEDICAL_HISTORY_API.md: immutable parameter
identity/definition/unit/method/specimen-kind signature, current PUBLISHED owned
reported numeric values only. No cross-series merging, unit conversion, invented
biomarker, range, severity or diagnosis. Censored points retain comparators and
null chartValue; consumers must not draw them as exact measurements. The preview
uses all retained history, and its seriesId opens the full trend with period=ALL.

Empty linked profile: zero counts, empty recentOrders/latestResults, null
nextAppointment/healthTrendPreview; catalogSuggestions still reflect the active
catalog (possibly empty). Notifications remain unavailable in every state.
Errors use the existing envelope, request ID and no-store policy.

Example request with the existing eligible patient bearer token or access cookie:

```http
GET /api/patients/me/dashboard
Accept: application/json
```

Illustrative empty response with an empty active catalog (synthetic identity):

```json
{
  "patientId": "00000000-0000-0000-0000-000000000001",
  "displayName": "Synthetic Patient",
  "asOf": "2026-10-30T10:00:00Z",
  "timeZone": "Asia/Jerusalem",
  "totalOrders": 0,
  "upcomingAppointmentCount": 0,
  "currentPublishedResultCount": 0,
  "notifications": {"available": false, "unreadCount": null},
  "recentOrders": [],
  "nextAppointment": null,
  "latestResults": [],
  "catalogSuggestions": [],
  "healthTrendPreview": null
}
```

## Section and action mapping

All patient destinations enforce stored eligible role and ownership in their
existing APIs; foreign/missing details share 404. Dashboard introduces only the
single aggregate endpoint above. Existing DTOs, writes and clinical authority stay
unchanged. Lists below retain their documented paging/filter/validation rules.

| Screenshot section / action | API / behavior |
|---|---|
| Welcome, header patient name | Dashboard displayName; profile `GET /api/patients/me/profile`. |
| Total orders / View all; My Orders sidebar and quick action | Dashboard totalOrders; `GET /api/orders/me`. |
| Upcoming appointments / View all; My Appointments | Dashboard upcomingAppointmentCount; `GET /api/appointments/me?tab=UPCOMING` (PAST for other records). |
| Available results / View all; My Results sidebar and quick action | Dashboard currentPublishedResultCount; `GET /api/results/me?tab=AVAILABLE` (ALL/PENDING supported). |
| Unread / View all; bell; Notifications sidebar | Explicitly unavailable; notification service/list/unread tracking deferred. Do not show a fabricated 0. |
| Search laboratory tests; Tests Catalog; Browse tests | `GET /api/lab-tests?search=...`; patient active visibility; category/paging/sort supported. |
| Popular tests cards / View all | Dashboard catalogSuggestions; `GET /api/lab-tests/{id}` and catalog list. Label as catalog suggestions; popularity is unavailable. |
| Review selected tests / create order | Catalog details supply current price/preparation; `POST /api/orders/me` with `{testIds:[...]}` and UUID Idempotency-Key, backend-calculated snapshots/totals; 201 new/200 replay. No cart persistence or payment inferred. |
| Book appointment | Choose an owned PENDING order from list/detail (or create it), `GET /api/appointment-types`, `GET /api/appointment-slots?orderId=...&typeId=...&from=...&to=...`, then `POST /api/appointments` with `{orderId,typeId,slotId}` and UUID Idempotency-Key. Existing capacity/time/retry checks apply. |
| Recent orders / View details | Dashboard recentOrders; `GET /api/orders/me/{orderId}`. |
| Recent orders / View visit details | Returned visits[].id/visitUrl; `GET /api/visits/me?orderId=...` supports multiple visits; `GET /api/visits/me/{visitId}` shows actual administrative details and only published result links. Empty visits means no visit action. |
| Next appointment / My Appointments | Dashboard nextAppointment; list above or `GET /api/appointments/me/{id}`. Existing alternatives/reschedule/cancel flows remain supported. |
| Latest result card / arrow | Dashboard latestResults[].resultUrl; `GET /api/results/me/{resultId}`; reportUrl `GET /api/results/me/{resultId}/report`; published correction history `GET /api/results/me/{resultId}/history`. |
| My Health Trends / View all | Dashboard compatible preview; `GET /api/results/me/trends/biomarkers`; `GET /api/results/me/trends?seriesId=...&period=ALL` (also documented calendar/custom periods). |
| Medical History sidebar | `GET /api/visits/me/archive`, `/archive/tests`, `/archive/{visitId}`; existing stricter completed-visit/publication evidence rules apply. |
| My Profile / account menu | `GET`/`PUT /api/patients/me/profile`; read-only email and existing completion/linking rules. Logout uses `POST /api/auth/logout` with existing cookie CSRF policy. |
| Back / Home / Dashboard breadcrumbs; language toggle | Client navigation/localization; no backend mutation/API required. |

Remaining intentional gaps: notifications/unread state, measured popularity,
payments and AI recommendations remain outside this slice. No PDF redesign.
Verification evidence and limits are recorded in TESTING.md, not inferred from
source inspection or screenshot sample values.
