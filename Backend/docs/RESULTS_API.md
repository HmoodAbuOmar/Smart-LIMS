# Results API Contract — Stage 4

Migration-version references in historical sections describe the original V1-V9
implementation. The current application migration set is canonical V1-V25 from
`src/main/resources/db/migration`; the earlier V1-V9 SQL remains only in test
fixtures for compatibility coverage. See [MIGRATION_LINEAGES.md](MIGRATION_LINEAGES.md).

NOTIF-38 (2026-10-31): only actual successful publication emits in-app patient
notifications, atomically with the source transaction. Corrected versions notify
only on publication. Draft/edit/approve/correction creation never notify; failed
publication leaves no event. See [NOTIFICATIONS_API.md](NOTIFICATIONS_API.md).
Existing publication authority and exact-version patient access remain unchanged.

Stage 5 additive patient reads: `GET /api/results/me/trends/biomarkers` and
`GET /api/results/me/trends`. See [MEDICAL_HISTORY_API.md](MEDICAL_HISTORY_API.md)
for owned numeric series, time windows, chart/table projections and arithmetic
changes. These use current publications only; the Stage 4 detail/history/report
routes below continue to expose authorized retained versions unchanged.

Status: Stage 4 DONE, 2026-10-30. Final isolated suite: 319 tests/44 suites,
zero failures/errors/skips; see [verification](TESTING.md#stage-4-verification-2026-10-30).
Owner manual checks/commit/deployment remain separate.
Tasks 19–27 and S4-RES-R01–R08 in IMPLEMENTATION_PLAN.md are the evidence index.
This contract supersedes the old proposed VALIDATED/automatic-reference model.
See VISITS_API.md, SAMPLES_API.md, LAB_TESTS_API.md and DATABASE_DESIGN.md.

## Decisions, authorization and historical data

- One result aggregate per existing order item, including panels. Reuse its
  lab_test_id, original test code/name snapshots and patient/order relationships.
- ADMIN manages NUMERIC/TEXT parameter definitions on the existing catalog. No
  clinical definitions, ranges or interpretation rules seeded. No automatic
  age/sex/time matching or flags. Authorized staff explicitly enter reference
  text, optional decimal bounds and NORMAL/HIGH/LOW/ABNORMAL/NOT_EVALUATED flags.
- LAB_TECHNICIAN alone authors/edits drafts. ADMIN clinical reviewers must also
  be explicitly listed by UUID in deployment-owner configuration
  `smartlims.laboratory.authorized-admin-ids` (environment
  SMARTLIMS_LABORATORY_AUTHORIZED_ADMIN_IDS, comma-separated canonical UUIDs).
  Default empty grants nobody. No account API or ordinary technical ADMIN may
  grant itself clinical authority. Current enabled/verified ADMIN role is still
  required. The same allowlist authorizes ADMIN specimen management.
- DRAFT→APPROVED→PUBLISHED. A reviewer who authored or edited that version cannot
  approve it, even if their role later changed. The approver may publish. Any
  edit of APPROVED content clears current approval and returns to DRAFT, retaining
  the approval/edit event history. All operations retain actor/time metadata.
- Published content/values/parameter/reference/specimen/patient/attribution
  snapshots are immutable. A correction requires a reason and a new version.
  At most one working version per order item. Old publication remains current
  until replacement publication atomically switches current markers.
- Patients may access only their own PUBLISHED versions, including clearly
  superseded history. Never reveal draft values or unpublished approval metadata.
  Missing/foreign/unpublished result IDs return the same 404 RESULT_NOT_FOUND.
- Every approved/published version requires a measuredAt instant and at least one
  suitable RECEIVED non-rejected specimen, with explicit suitability for this
  order item and a real visit that includes that item. Recheck at publication.
  Required parameter values must be filled; optional empty rows remain unreported.
- All existing order items are required: orders have no optional-item flag.
  IN_PROGRESS→COMPLETED only when every item has a current publication and every
  real visit is administratively completed. Reconsider on publication and visit
  completion. Appointment/visit closure alone never claims results complete.
- Specimen evidence referenced by APPROVED/PUBLISHED results cannot be rejected
  or rewritten. First invalidate an unpublished approval by editing the draft.
  Post-publication withdrawal/recall is outside this stage; do not silently mutate
  published evidence. This guard reconciles rejection with immutable publications.

## Routes

Existing JWT/cookie CSRF, current eligible stored roles and no-store responses apply.

| Method/path | Access | Success |
|---|---|---|
| GET /api/results/work-items | LAB_TECHNICIAN / authorized reviewer ADMIN | Paginated noncancelled order items; optional orderId; administrative identity, test and current/working result IDs/states. |
| GET /api/results/versions?orderItemId={id} | Same laboratory staff | All retained versions for a known item. |
| GET /api/results/{id} | Same laboratory staff | Full working/published version. |
| POST /api/results | LAB_TECHNICIAN | Initial draft; Idempotency-Key; 201 new / 200 exact replay. |
| PUT /api/results/{id} | LAB_TECHNICIAN | Full mutable content replacement with expectedVersion; 200. |
| POST /api/results/{id}/approve | authorized reviewer ADMIN | Approval with expectedVersion; 200. |
| POST /api/results/{id}/publish | authorized reviewer ADMIN | Publication with expectedVersion; 200. |
| POST /api/results/{id}/corrections | LAB_TECHNICIAN | New working revision of current publication; reason + Idempotency-Key; 201/200. |
| GET /api/results/me | PATIENT | Owned result work-item page, including pre-visit pending tests. |
| GET /api/results/me/{id} | PATIENT | Complete owned published version. |
| GET /api/results/me/{id}/report | PATIENT | Authorized version PDF attachment. |
| GET /api/results/me/{id}/history | PATIENT | Published versions of the same owned item only. |

No general status-update/deletion, author self-approval, clinical permission grant,
patient draft endpoint, public report path or invented visit URL.

## Inputs and strict validation

Canonical UUIDs; reject unknown JSON properties. List selectors reject unknown or repeated query parameters.
Strings are strict JSON strings, trimmed; no numeric/boolean coercion. Decimal
values are JSON numbers/BigDecimal, at most 26 integer/12 fractional digits,
finite; no formatted measurement strings. This is a storage bound, not a clinical
range. supplied minimum <= maximum when both present; never derive flags from it.
Numeric comparator, if supplied: <, <=, >, >= and requires numericValue.

POST /api/results: {orderItemId}. The draft snapshots every active parameter
(at least one active definition overall, not necessarily a clinically required
parameter) in display-order/UUID order, initially unreported. Existing
drafts never silently change with the catalog. Order must be IN_PROGRESS with
real visit membership for the item. No initial draft over an existing publication;
use corrections. measuredAt/specimens/values are supplied by PUT.

PUT: {expectedVersion,measuredAt,specimenIds,explanation,values}. measuredAt may
be null in DRAFT, otherwise explicit offset timestamp (seconds, <=6 fractional
digits); cannot be future. Approval also rejects measurement preceding a known
used specimen collection time.
specimenIds unique array 0–100; at approval at least one. explanation optional
patient-facing text <=10000 characters. values contains exactly one entry per
snapshotted parameter (1–200), each {parameterId,numericValue,numericComparator,
textValue,referenceText,referenceMin,referenceMax,flag,notes}. Numeric/text values
mutually exclusive and match the snapshot type. Text <=10000, referenceText/notes
<=2000. Flag required for every row; unreported rows use NOT_EVALUATED, no numeric
comparator. Unit/method/name/requiredness are snapshot fields, not client overrides.

approve/publish: {expectedVersion}. Corrections: {reason} (trimmed nonblank <=1000),
copying previous published content/definition/reference/specimen snapshots into a
new draft, new author/review lifecycle and next version number. Only current
publication can be corrected. Technical row revision (`version`) differs from
clinical `versionNumber`. Mutations reject stale versions with 409 RESULT_CHANGED.
Repeated approve/publish with current expectedVersion and already-target state
is a no-op; stale requests conflict. Refresh after network uncertainty. Create/
correction retries use exactly one UUID Idempotency-Key, scoped by author; original
intent returns retained current version without mutation, different intent→409.

## Patient list, detail and reports

GET /me query: tab=ALL(default)/AVAILABLE/PENDING; search trimmed <=150, literal
case-insensitive original ordered-test name; category exactly one existing
LabTestCategory identifier. Current catalog membership is deliberately used for
filtering; category changes can change historical list membership. No category
backfill/snapshot is inferred. Combine filters with AND before unique-item counts.
page=0,size=20 defaults; digits only, int page>=0,size1–100; unknown/repeated→400.
Sort order createdAt descending, item UUID ascending; large offsets remain bounded.

One row per orderItemId: orderId/orderNumber, testCode/testName snapshots,
currentResultId nullable, reportDate nullable (publishedAt in Asia/Jerusalem),
publishedAt nullable UTC, status=PUBLISHED/PENDING, current categories,
canViewResult/canDownloadReport, visitDetailsAvailable and real visitIds. Available
requires current publication. Pending has none and order not CANCELLED. All is
their union. Keep published access on cancelled orders. A correction draft never
hides current publication. Linked profile absent→404 PATIENT_PROFILE_NOT_LINKED;
linked empty→200 empty page. Visit eligibility requires a persisted item/visit link.

Detail includes id/orderItemId/orderId/orderNumber, version/versionNumber/status,
isCurrent/superseded, previousResultId/correctionReason, original test identity,
patient name/number/date-of-birth snapshots, measurement/approval/publication times
separately, retained approval/publication names/IDs, explanation, parameter values
with complete definition/reference/flag snapshots, specimen snapshots with visit
references and collection/receipt/attestation details, real visit IDs, lifecycle
events (staff only). List rows expose screen action eligibility. Patient projection never contains
draft history/internal events/notes. Superseded versions are labelled explicitly.

Report date=publication date in Asia/Jerusalem. Generate one English-labelled PDF
per published test/version, all parameters, actual stored patient identifiers,
order/visit/specimen references and times, supplied values/units/references/flags,
version/correction/supersession notice and approval/publication attribution. Embed
an Arabic-capable font and shape/bidi-render stored Arabic text. Neutral layout;
only deployment-supplied laboratory identity/logo may appear. No invented branding,
credentials/signatures/digital-signature claim. No payment information. Content-Type
application/pdf; private no-store attachment filename derived from UUID/version,
never patient input. Render escaped stored text, no external URI fetching. Read a
consistent authorized published snapshot; generated report never reads live clinical
definitions or discloses a storage path. Optional laboratory identity configuration
is documented with implementation; absent identity/logo means omitted.

## Errors, consistency and verification

Existing {code,message,fieldErrors,requestId}, X-Request-Id/no-store envelope.
401 invalid/ineligible authentication; 403 role/clinical grant; 400 VALIDATION_ERROR
or INVALID_JSON; 404 RESULT_NOT_FOUND/ORDER_ITEM_NOT_FOUND; 409 RESULT_CHANGED,
RESULT_STATE_CONFLICT, RESULT_INCOMPLETE, RESULT_SPECIMEN_UNAVAILABLE,
RESULT_WORKING_VERSION_EXISTS, IDEMPOTENCY_KEY_REUSED. No raw exception/clinical
payload/token logging. Validate request syntax before state mutation.

All clinical writers lock the existing order first; identity retry lock precedes
order; result/sample/visit rows follow, catalog snapshot locks last. Visits touching
appointments follow order→appointment coordination→appointment→slot, never inverse.
Same-order serialization protects publication/rejection/edit/completion/cancellation.
Current-version swap and aggregate completion roll back together on failure.
Published content and lifecycle event retention are reinforced by SQL constraints/
immutability guards. Execution evidence belongs in TESTING.md.

## Manual HTTP verification

These requests are documented for the owner's manual client checks; they were
not executed with Postman or a live HTTP client. Automated HTTP evidence uses
MockMvc, real security/JWT and isolated PostgreSQL. Use synthetic data in a test
environment. All paths below are relative to `{{baseUrl}}` (for example your
configured local application URL); no server is started by this documentation.

Use `Authorization: Bearer <token-for-the-specified-role>` and
`Content-Type: application/json` for JSON writes. Every creation/correction request
also needs exactly one `Idempotency-Key: <fresh-canonical-UUID>`; retain that key
for exact retries. Capture IDs and the returned `version` after every write.
Numbers below are synthetic storage examples, not clinical definitions or ranges.
Use actual offset timestamps (seconds, at most six fractional digits, never future)
for `{{arrivedAt}}`, `{{measuredAt}}`, `{{completedAt}}`. Measurement must not precede
any known used specimen collection time. Collection may be null; do not invent it.

Deployment prerequisite: the owner sets
`SMARTLIMS_LABORATORY_AUTHORIZED_ADMIN_IDS=<reviewer-admin-uuid>` before application
startup, using an eligible existing ADMIN. Blank grants nobody. Use a distinct
LAB_TECHNICIAN author. Optional supplied identity/logo are
`SMARTLIMS_REPORT_LABORATORY_IDENTITY` and `SMARTLIMS_REPORT_LOGO_PATH`
(local file:/classpath: PNG/JPEG, <=2 MiB, <=4096 pixels/dimension). Blank omits them.
No credential or clinical grant is seeded by migrations.

1. ADMIN creates a dedicated synthetic test, or selects an existing suitable test
   with approved definitions. For the fresh synthetic example:

```http
POST {{baseUrl}}/api/lab-tests

{"code":"S4_MANUAL","name":"Synthetic Stage 4 panel","price":0,"currency":"ILS","sampleType":"SYNTHETIC","categories":["BLOOD_TESTS"]}
```

Save `id` as `{{testId}}`. ADMIN defines its parameters (two separate requests):

```http
POST {{baseUrl}}/api/lab-tests/{{testId}}/parameters

{"code":"SYN_NUM","name":"Synthetic numeric","resultType":"NUMERIC","unit":"synthetic-unit","method":"Supplied synthetic method","displayOrder":0,"required":true,"active":true}
```

```http
POST {{baseUrl}}/api/lab-tests/{{testId}}/parameters

{"code":"SYN_TEXT","name":"Synthetic text","resultType":"TEXT","unit":null,"method":null,"displayOrder":1,"required":false,"active":true}
```

Save the two `id` fields as `{{numericParameterId}}`/`{{textParameterId}}`.
`GET /api/lab-tests/{{testId}}/parameters?page=0&size=20` retrieves definitions.
These calls do not require Idempotency-Key; duplicate codes conflict.

2. PATIENT books the ordered tests using the existing order API (not an appointment):

```http
POST {{baseUrl}}/api/orders/me
Idempotency-Key: <new-order-UUID>

{"testIds":["{{testId}}"]}
```

Save `id`→`{{orderId}}`, `items[0].id`→`{{orderItemId}}`. Expect PENDING order and
one Pending results row even before arrival:

```http
GET {{baseUrl}}/api/results/me?tab=PENDING&search=Synthetic&category=BLOOD_TESTS&page=0&size=20
```

Expect PENDING, null reportDate/currentResultId, disabled result/report actions,
and no visit IDs. ALL includes it; AVAILABLE does not. Existing appointment
booking is optional; follow APPOINTMENTS_API.md and save its actual appointment ID.

3. ADMIN/RECEPTIONIST explicitly records actual arrival:

```http
POST {{baseUrl}}/api/visits
Idempotency-Key: <new-visit-UUID>

{"orderId":"{{orderId}}","appointmentId":null,"orderItemIds":["{{orderItemId}}"],"arrivedAt":"{{arrivedAt}}"}
```

Save `id`→`{{visitId}}`, `version`→`{{visitVersion}}`. Expect IN_PROGRESS order,
OPEN visit. For an actual appointment arrival substitute that appointment ID:
its state becomes CHECKED_IN, occupancy remains consumed and direct cancel/move
are disabled. No visit is created by the order or appointment alone.

4. LAB_TECHNICIAN (or authorized reviewer ADMIN) records and receives a specimen:

```http
POST {{baseUrl}}/api/samples
Idempotency-Key: <new-specimen-UUID>

{"visitId":"{{visitId}}","sampleType":"SYNTHETIC","containerType":"Synthetic container","collectedAt":null,"replacesSampleId":null}
```

Save `id`→`{{sampleId}}`, its `version`→`{{sampleVersion}}`. Then:

```http
POST {{baseUrl}}/api/samples/{{sampleId}}/receive

{"expectedVersion":{{sampleVersion}}}
```

```http
POST {{baseUrl}}/api/samples/{{sampleId}}/attestations

{"orderItemId":"{{orderItemId}}"}
```

Expect RECEIVED plus an explicit retained attestation. Generic ADMIN and
RECEPTIONIST cannot perform clinical specimen operations. Use actual supplied
collection time when known; no inferred compatibility.

5. LAB_TECHNICIAN creates and fills a draft:

```http
POST {{baseUrl}}/api/results
Idempotency-Key: <new-result-UUID>

{"orderItemId":"{{orderItemId}}"}
```

Save `id`→`{{resultId}}`, `version`→`{{resultVersion}}`. PUT the full parameter
set from that draft, including optional unreported rows when applicable:

```http
PUT {{baseUrl}}/api/results/{{resultId}}

{
  "expectedVersion":{{resultVersion}},
  "measuredAt":"{{measuredAt}}",
  "specimenIds":["{{sampleId}}"],
  "explanation":"Synthetic reviewed explanation / شرح تجريبي",
  "values":[
    {"parameterId":"{{numericParameterId}}","numericValue":1.25,"numericComparator":null,"textValue":null,"referenceText":"Explicitly supplied synthetic reference","referenceMin":null,"referenceMax":null,"flag":"NOT_EVALUATED","notes":null},
    {"parameterId":"{{textParameterId}}","numericValue":null,"numericComparator":null,"textValue":"Synthetic text / نص تجريبي","referenceText":null,"referenceMin":null,"referenceMax":null,"flag":"NOT_EVALUATED","notes":null}
  ]
}
```

Save the new `version`. Staff queue: `GET /api/results/work-items?orderId={{orderId}}`;
clinical staff detail: `GET /api/results/{{resultId}}`; full staff version list:
`GET /api/results/versions?orderItemId={{orderItemId}}&page=0&size=20`.

6. The distinct authorized ADMIN reviewer approves, then publishes, each with
   the latest returned revision:

```http
POST {{baseUrl}}/api/results/{{resultId}}/approve

{"expectedVersion":{{resultVersion}}}
```

While APPROVED, patient detail/report still returns 404. Update `{{resultVersion}}`:

```http
POST {{baseUrl}}/api/results/{{resultId}}/publish

{"expectedVersion":{{resultVersion}}}
```

Expect PUBLISHED/isCurrent=true and publication date. Generic ADMIN, technician
approval or an author/editor who later becomes a reviewer must receive 403.
Editing APPROVED content returns DRAFT and clears approval; publishing then fails
until independently reapproved. Published PUT returns 409.

7. PATIENT checks the complete screen, detail, PDF and real visit:

```http
GET {{baseUrl}}/api/results/me?tab=ALL&page=0&size=20
GET {{baseUrl}}/api/results/me?tab=AVAILABLE&search=Synthetic&category=BLOOD_TESTS&page=0&size=20
GET {{baseUrl}}/api/results/me?tab=PENDING&page=0&size=20
GET {{baseUrl}}/api/results/me/{{resultId}}
GET {{baseUrl}}/api/results/me/{{resultId}}/history?page=0&size=20
GET {{baseUrl}}/api/results/me/{{resultId}}/report
Accept: application/pdf
GET {{baseUrl}}/api/visits/me/{{visitId}}
GET {{baseUrl}}/api/visits/me?orderId={{orderId}}&page=0&size=20
```

The report request returns PDF attachment with private/no-store caching and all
parameters/snapshots, separate times and real visit/specimen references. Visit
detail contains current published links and no draft values/internal notes/payment
data. Another patient receives the same 404 as a missing result/visit.

8. ADMIN/RECEPTIONIST administratively closes the real visit:

```http
POST {{baseUrl}}/api/visits/{{visitId}}/complete

{"expectedVersion":{{visitVersion}},"completedAt":"{{completedAt}}"}
```

The linked appointment becomes COMPLETED and releases occupancy. Order becomes
COMPLETED only if every item has a current publication and all visits are closed.
Closing before publication leaves it IN_PROGRESS.

9. LAB_TECHNICIAN starts a correction of the current publication:

```http
POST {{baseUrl}}/api/results/{{resultId}}/corrections
Idempotency-Key: <new-correction-UUID>

{"reason":"Synthetic correction for manual verification"}
```

Save the returned new result ID/version. Edit/approve/publish using steps 5–6.
Old publication stays available until replacement publication. Afterwards its
detail/report remains owned-accessible and explicitly superseded; history has both
publications and excludes working versions.

Additional checks: `POST /api/samples/{{sampleId}}/reject` with
`{"expectedVersion":<latest>,"reason":"Synthetic rejection"}` succeeds only for
unprotected specimens; approved/published evidence returns SAMPLE_IN_USE. Replace
a genuinely rejected specimen using a fresh POST /api/samples with its ID in
replacesSampleId, then separately receive/attest. For an actually elapsed,
unvisited CONFIRMED appointment, ADMIN/RECEPTIONIST may
`POST /api/appointments/{{appointmentId}}/no-show` with `{"expectedVersion":<latest>}`;
before slot end or after arrival it conflicts. Repeats preserve original metadata.
Do not fabricate attendance or modify database timestamps for manual checks.

Reusing a creation key with different intent conflicts; stale result revisions
return RESULT_CHANGED. Unknown JSON, string decimals, repeated list filters and
cross-order specimen links are rejected. Cookie writes require access_token plus
the XSRF-TOKEN cookie from GET /api/auth/csrf-token and matching X-XSRF-TOKEN header.
