# Medical History API - Stage 5

Status: DONE, 2026-10-30. Tasks 28-32, S5-MH-R01-R06. Final direct isolated
`.\mvnw.cmd test`: 345 tests/46 suites, zero failures/errors/skips.
See [execution evidence](TESTING.md#stage-5-medical-history-verification-2026-10-30).
Owner manual client verification, commit and deployment remain separate.

Patient-only read APIs. Existing JWT/cookie authentication, CSRF policy, current
eligible stored roles, error envelope, X-Request-Id and `Cache-Control: no-store`
apply. Identity always comes from the authenticated patient's linked profile;
there is no patientId selector. Unlinked profile: 404 PATIENT_PROFILE_NOT_LINKED.
Staff: 403; missing/invalid authentication: 401. No writes or side effects;
GET retries are safe. Lists/details use repeatable-read transactions.

## Visit archive

`GET /api/visits/me/archive/tests` supplies the Test dropdown: owned archived
tests including inactive catalog entries. Optional search/page/size; same literal
search and pagination validation/envelope. Each choice is
`{labTestId,testCode,testName}`. One per catalog UUID, labelled with its latest
archived measurement's original ordered-test snapshots (result UUID ascending
breaks equal measuredAt ties). Sort testName then labTestId ascending. Search
matches that choice's code/name. Filters for a specific archive page do not hide
other choices. No publication/visit means no choice. No arbitrary patient input.

`GET /api/visits/me/archive`

Only COMPLETED visits with at least one current PUBLISHED result backed by a
specimen from that exact visit. Reuses visits -> order -> patient, visit_items,
test_results -> order_items and result_specimens -> samples -> visit. A same-order
or selected-item relationship alone does not assign a result to a visit. A result
using specimens from multiple visits may legitimately appear in each such visit.
Closed visits awaiting all publication are included once one result is published;
open visits and closed visits with no current publication are excluded.
Published history on a cancelled order remains available. Corrections replace
current results atomically; working corrections never hide the prior publication.

Optional filters, combined with AND before unique visit counts:

| Query | Meaning |
|---|---|
| search | Trimmed <=150; literal case-insensitive substring of visit/order number or published ordered-test code/name snapshots. `%`, `_`, backslash are literal. |
| fromDate, toDate | Strict yyyy-MM-dd, inclusive arrival dates in Asia/Jerusalem; either bound allowed; from <= to. DST uses local day boundaries, not fixed 24-hour days. |
| testId | Canonical existing catalog UUID, matching the published result's ordered test; unknown/foreign selection yields empty list. |
| resultStatus | One of NORMAL,HIGH,LOW,ABNORMAL,NOT_EVALUATED; matches a reported numeric/text value's stored flag on the same published test as testId. Omit for All. No computed visit severity. |
| page,size | Defaults 0,20; decimal digits only; page>=0, size 1-100. |

Sort arrivedAt descending, visit UUID ascending. Unknown/repeated queries,
malformed UUIDs, dates, flags, overlong search and invalid paging: 400
VALIDATION_ERROR with fieldErrors. Distant pages are empty with accurate totals.
Envelope: `{content,page,size,totalElements,totalPages,first,last}`.

Row: `id,visitNumber,orderId,orderNumber,appointmentId,status,arrivedAt,visitDate,
completedAt,tests,resultFlags,visitUrl`. `tests` contains **all current published
tests evidenced by that visit**, even when filters matched only one test. Each
test has `orderItemId,labTestId,testCode,testName,resultId,measuredAt,publishedAt,
flags,resultUrl,reportUrl`. Flags are distinct stored flags of reported values;
no aggregate diagnosis. visitUrl uses the existing `/api/visits/me/{id}` endpoint.
No amount paid, payment status or inferred payment information.

`GET /api/visits/me/archive/{id}` returns `{visit,results}`: the archive row and
complete current published ResultResponse DTOs (same retained content as Stage 4
`GET /api/results/me/{resultId}`). Missing/foreign/open/no-publication visit:
404 VISIT_NOT_FOUND. Canonical UUID required; no query parameters accepted.
Existing Stage 4 visit/result/history/report endpoints and payloads are unchanged.

## My Health Trends

`GET /api/results/me/trends/biomarkers`

Optional search (same literal <=150 substring of retained parameter code/name or
ordered-test code/name) and page/size as above. Returns the same page envelope.
Only reported NUMERIC values from owned current PUBLISHED results are selectable.
TEXT/unreported/draft/approved/superseded rows never enter a trend. A numeric zero
is reported data. Parameter deactivation/catalog edits do not erase publications.

Series fields: `seriesId,parameterId,code,name,unit,method,specimenKinds,
measurementCount,latestMeasuredAt`. seriesId is a deterministic lowercase SHA-256
opaque key over parameter UUID/code/name/type snapshots, unit, method and sorted
distinct `{sampleType,containerType}` pairs from immutable publication specimen
snapshots. Null is distinct from a supplied string. No unit conversion or merging
of same-named parameters across catalog tests. Multi-specimen signatures form a
separate series; repeated specimens of identical kind do not duplicate points.
Sort retained name ascending, seriesId ascending. Search includes a series if any
of its points matches; measurementCount covers the whole series, not search hits.
Selection is rediscovered after current publication changes; keys have no write
authority and are always resolved against owned data.

`GET /api/results/me/trends?seriesId={key}&period=6M&page=0&size=20`

seriesId required, exactly 64 lowercase hex characters. Unknown/foreign/no-longer
current key: 404 TREND_SERIES_NOT_FOUND. Malformed: 400 VALIDATION_ERROR.
period: `1M`, `3M`, `6M` (default), `1Y`, `ALL`, `CUSTOM`. Rolling windows start
at local midnight today minus the specified calendar months/year, inclusive,
and end at tomorrow's midnight exclusive in Asia/Jerusalem. `ALL` has no lower
bound and also ends at tomorrow's midnight. `CUSTOM` requires both fromDate and
toDate (inclusive, from<=to). Date fields with any other period are rejected.
Response explicitly returns `timeZone,fromDate,toDate` (ALL fromDate null).

Response:

```json
{
  "series": {"seriesId":"<key>","parameterId":"<uuid>","code":"SYN_NUM",
    "name":"Synthetic numeric","unit":"synthetic-unit","method":"Synthetic method",
    "specimenKinds":[{"sampleType":"SYNTHETIC","containerType":null}],
    "measurementCount":2,"latestMeasuredAt":"2026-10-24T07:00:00Z"},
  "timeZone":"Asia/Jerusalem","fromDate":"2026-04-30","toDate":"2026-10-30",
  "measurementCount":2,
  "latest":{"numericValue":11,"measuredAt":"2026-10-24T07:00:00Z"},
  "previous":{"numericValue":11.2,"measuredAt":"2026-10-12T06:30:00Z"},
  "absoluteChange":-0.2,"percentageChange":-1.785714,
  "chartData":[],
  "measurements":{"content":[],"page":0,"size":20,"totalElements":2,
    "totalPages":1,"first":true,"last":true}
}
```

Illustrative numbers are synthetic, not clinical ranges. latest/previous above
are abbreviated: all point projections use the complete measurement DTO below.
chartData contains **every** filtered measurement ascending by measuredAt then
orderItemId then valueId (UUID lexical order). Measurements table is independently
paged in exact reverse order. Statistics and latest/previous use the entire
selected window, independent of the table page. No chart rendering, interpolation,
downsampling, smoothing or clinical interpretation occurs in the backend.

Measurement fields: `valueId,resultId,orderItemId,orderId,orderNumber,testCode,
testName,parameterId,code,name,measuredAt,measurementDate,publishedAt,numericValue,
numericComparator,chartValue,unit,method,referenceText,referenceMin,referenceMax,
flag,notes,explanation,visits,resultUrl`. visits contains distinct retained
`{id,visitNumber,visitUrl}` references from the published specimen snapshots.
Result/report/visit APIs remain the Stage 4 sources for full details/downloads.

Dates/order use **measuredAt**, never publication, arrival or correction creation
time. Supplied flags/references/notes/explanation are returned unchanged. No new
reference matching, severity inference, external educational links or diagnosis.
numericComparator is retained; chartValue is null for censored `<,<=,>,>=` values,
otherwise numericValue. Consumers must not plot censored values as exact points.

latest/previous are the last two measurements **inside the selected window**.
Empty window: count 0, null latest/previous/changes, empty chart/table; single
measurement: previous/changes null. Signed absoluteChange=latest-previous (not
absolute magnitude); percentageChange=(latest-previous)/previous*100, six decimal
places HALF_UP. Previous zero: absolute difference still supplied, percentage
null. Either latest/previous censored: both differences null. Zero difference is
zero, never NaN/infinity. These are arithmetic changes, not health assessments.

## Manual request examples

Use the existing eligible patient bearer token or cookie; no patient UUID input.

```http
GET /api/visits/me/archive?search=VIS-&fromDate=2026-01-01&toDate=2026-10-30&resultStatus=LOW&page=0&size=20
GET /api/visits/me/archive/{visitId}
GET /api/visits/me/archive/tests?search=Synthetic&page=0&size=20
GET /api/results/me/trends/biomarkers?search=Synthetic&page=0&size=20
GET /api/results/me/trends?seriesId={seriesId}&period=6M&page=0&size=20
GET /api/results/me/trends?seriesId={seriesId}&period=CUSTOM&fromDate=2026-01-01&toDate=2026-10-30
GET /api/results/me/{resultId}
GET /api/visits/me/{visitId}
```

Execution evidence, including database isolation and any limitations, belongs in
TESTING.md and Tasks 28-32 of IMPLEMENTATION_PLAN.md.
