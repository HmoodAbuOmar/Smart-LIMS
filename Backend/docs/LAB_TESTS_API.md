# Lab Tests API

Traceability: R-CAT-01 and R-NFR-01; existing slice T-CAT-00 in the [backend SDLC index](../IMPLEMENTATION_PLAN.md). Parameters (R-CAT-02; T-CAT-01/02/03) and reference ranges (R-CAT-03; T-REF-01/02/03) remain planned. Extend this contract and close their decisions before implementing them; the existing endpoints below do not manage either feature.

Implemented catalog endpoints use `/api/lab-tests` and JSON. Test Parameters and Reference Ranges are separate modules. Schema names follow `DATABASE_DESIGN.md` (`active`, not `is_active`). Flyway V4 defines the base catalog and remains unchanged.

Task 3 implementation update (2026-10-28): POST/PUT accept category arrays persisted through the Task 2 `LabTest.categories` mapping and V6 table. PUT replaces the complete set; PATCH status preserves assignments. Every test response includes the full array in contract order, or `[]`. V1-V6 are unchanged. Task 4 adds singular category membership filtering and patient active-only list visibility. Task 5 inactive-detail restrictions remain unimplemented. Storage, assignment, and list verification are recorded separately in [TESTING.md](TESTING.md).

All endpoints require an eligible authenticated account using the existing bearer token or access cookie. Cookie writes also require the existing CSRF token. ADMIN, RECEPTIONIST, and LAB_TECHNICIAN may list either availability state. PATIENT lists return active tests only; a well-formed `active=false` is forbidden. Detail access is currently unchanged for all four roles, including inactive entries; patient inactive-detail 404 is deferred to Task 5. Only ADMIN can write. No delete endpoint exists: deactivate records to retain their identity for historical references.

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | `/api/lab-tests` | Search and page catalog | 200 |
| GET | `/api/lab-tests/{id}` | Get one test | 200 |
| POST | `/api/lab-tests` | Create an active test | 201 with Location |
| PUT | `/api/lab-tests/{id}` | Replace catalog fields, preserving availability | 200 |
| PATCH | `/api/lab-tests/{id}/status` | Set availability | 200 |

## Create and replace

```json
{
  "code": "CBC",
  "name": "Complete Blood Count",
  "description": "Blood cell panel",
  "price": 25.50,
  "currency": "ILS",
  "sampleType": "Blood",
  "preparationInstructions": "Follow the laboratory's instructions",
  "categories": []
}
```

`code`, `name`, `price`, and `sampleType` are required. Strings are trimmed. Code is normalized to uppercase and must match `[A-Z0-9][A-Z0-9_-]{0,29}`; uniqueness includes inactive tests. Name has a 150-character limit; sampleType has a 40-character limit. Optional description and preparationInstructions have 10,000-character limits and blank values become null. PUT clears omitted optional text. Currency defaults to ILS when omitted or null; any supplied non-ILS currency is rejected.

`categories` is optional and accepts up to seven unique identifiers from the [fixed vocabulary below](#category-identifiers-and-discovery-s1-cat-r0102). POST omission/null/`[]` creates no assignments; PUT omission/null/`[]` clears assignments. A nonempty array replaces the entire set atomically with catalog fields; request order is immaterial. Values must match the identifiers exactly, without trimming, case conversion, or deduplication. Duplicates, excessive count, null elements, blank/unknown values, labels, lowercase, and padded identifiers return 400 `VALIDATION_ERROR` with `fieldErrors.categories`. A non-array/non-null member or non-null non-string element returns 400 `INVALID_JSON`. PATCH status preserves assignments.

Price must be a JSON number from 0 through 9999999999.99, with at most two fractional digits. Strings, booleans, negative prices, excessive precision, and non-finite values are rejected. Text fields require JSON strings. IDs, availability, and timestamps are server-managed on create/replace; use the status endpoint to change availability.

The status request is `{"active":false}` or `{"active":true}`. The field is required and accepts only a JSON boolean. Repeating a status request is safe. Catalog writes are transactional; updates to a single test are serialized using a database row lock. Code uniqueness is also enforced by a database constraint, including concurrent requests. Current price updates affect only the catalog row; future order code must snapshot its name and price at order creation.

## Responses and queries

Create, detail, replace, and status return `id`, `code`, `name`, `description`, `price`, `currency`, `sampleType`, `preparationInstructions`, `active`, `createdAt`, `updatedAt`, and `categories`. List content uses the same DTO. `categories` always contains every assigned identifier in the vocabulary-table order and is `[]` when empty, never null. IDs are UUIDs and timestamps are UTC ISO instants. Internal JPA entities are never returned.

List accepts these optional parameters, each at most once:

| Parameter | Default | Validation |
|---|---|---|
| search | empty | Trimmed, up to 150 characters; case-insensitive literal substring of code or name |
| category | omitted | One exact identifier from the fixed vocabulary; matches membership and returns every assigned category. Omission includes uncategorized tests subject to availability. |
| active | omitted | Exact `true` or `false`. Staff omission includes both states; PATIENT omission/true returns active only, false returns 403. |
| page | 0 | Nonnegative integer, zero-based |
| size | 20 | Integer from 1 through 100 |
| sort | `name,asc` | code, name, price, createdAt, or updatedAt followed by `,asc` or `,desc` |

Each supported parameter may occur at most once, including identical repeated values. Category identifiers are case-sensitive and are not trimmed: blank, `All`, `null`, unknown, lowercase, padded, and comma-separated values return 400 `VALIDATION_ERROR` on `category`. Validate all supported syntax before the patient inactive-list policy: malformed/repeated values return 400 even alongside `active=false`. Unknown query keys remain ignored and cannot override visibility.

Search, category membership, and effective availability combine with AND before pagination/counting. Category membership uses a correlated EXISTS predicate, so multiple assignments cannot duplicate tests or inflate totals. Unfiltered lists include uncategorized tests subject to role/availability, and every item retains its complete categories array. Empty results and distant pages return 200 with the existing page envelope.

Sorting adds UUID as a stable tie-breaker. Search treats `%`, `_`, and backslash literally. List returns `content`, `page`, `size`, `totalElements`, `totalPages`, `first`, and `last`. Distant pages beyond the result set return empty content.

## Errors

Errors follow the existing `{code,message,fieldErrors,requestId}` format, with `X-Request-Id` and `Cache-Control: no-store`. `fieldErrors` maps field names to messages and is empty when no field applies. No SQL or exception details are exposed. Configured exact CORS origins can read `Location` and `X-Request-Id`; unconfigured origins remain denied.

| Status | Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid fields (including category assignment values/count/duplicates), UUID, filter, sort, or pagination |
| 400 | INVALID_JSON | Malformed body or incorrect JSON type, including category containers/elements |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | Wrong role, patient explicit inactive-list request, or invalid/missing cookie CSRF protection |
| 404 | LAB_TEST_NOT_FOUND | Valid UUID with no catalog test |
| 405 | Framework response | Unsupported method when the request reaches MVC; the security filter can reject unconfigured methods with 403 first |
| 409 | LAB_TEST_CODE_IN_USE | Normalized code already exists |
| 415 | Framework response or INVALID_REQUEST | Unsupported Content-Type on POST, PUT, or PATCH after authentication and CSRF checks |
| 500 | INTERNAL_SERVER_ERROR | Unexpected failure |

405 and 415 can be resolved before a controller is selected, so their framework response body is not guaranteed to use the catalog error envelope. Existing security takes precedence: for example, authenticated DELETE is denied with 403, since no delete endpoint is authorized.

## Stage 1 Task 1: patient catalog target contract

Reviewed 2026-10-27 against the existing `labtests` controller, DTOs, service, mapper, repository, specifications, error handlers, security matchers, and Flyway V1-V5 sources; persistence updated in Task 2 on 2026-10-28 with V6. This section retains the finalized Stage 1 contract. Category storage/mapping and Task 3 category assignment/response arrays are implemented. Task 4 implements membership filtering and patient active-only list behavior. Patient inactive-detail restrictions remain **not implemented** (Task 5). The preceding sections describe current HTTP behavior; the inactive-detail 404 rule/example below remains a target. Each task has separate verification evidence.

Traceability: Stage 1 Task 1 in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md#task-1--catalog-requirements-and-api-contract), extending existing R-CAT-01 and R-NFR-01. Stage 1 Task 1 is distinct from the older parameter task identifier T-CAT-01. Local acceptance IDs: S1-CAT-R01 (fields/categories), S1-CAT-R02 (queries/discovery), S1-CAT-R03 (permissions), and S1-CAT-R04 (legacy-data compatibility).

### Fields and existing operations

Reuse all five existing endpoints and their success statuses above. List items and detail responses use the same DTO. Catalog cards have `id`, `code`, `name`, optional `description`, `price`, `currency`, and `categories` (an array of zero or more identifiers); details additionally display `sampleType` and optional `preparationInstructions`. Preserve `active`, `createdAt`, and `updatedAt` in both responses. No separate card DTO, image, turnaround time, or clinical range is required by this plan. Missing optional text remains JSON null, with no invented preparation advice. Required existing fields and their validation remain unchanged.

Visual reference reviewed: [tests-catalog.jpeg](../ui-references/tests-catalog.jpeg). The requested `ui-references/tests-catalog/` directory is absent; this single image is the available catalog reference. It shows the list rather than a separate detail screen. The following maps visible controls/data to the contract; detail fields follow the written plan.

| Screen data or action | Backend contract / scope |
|---|---|
| Search laboratory tests (header and catalog controls) | Existing `search` on code/name; both controls use the same query semantics |
| Category dropdown and seven category chips | One optional `category` filter; dropdown/chips represent the same selection, not separate filters |
| All / All categories; Clear filters | Omit `category`; clearing also removes search and resets page to 0; patient visibility remains enforced |
| Category label, test title/code, description, shekel price | `categories` mapped to labels, `name`/`code`, nullable `description`, numeric `price` and `currency: ILS`; screenshot prices/text are illustrative, not seed data |
| View details | Existing `GET /api/lab-tests/{id}`; sample/preparation fields come from the plan |
| Added / selection state; Review order count | Client selection state for a future order; no cart/order write or persistent selection API in Stage 1 |
| Flask icon, navigation, notifications, language switch | Presentation or separate modules; no new catalog field or operation |

Multiple categories and empty category sets are explicitly approved even though each visible card shows one label. Return all assigned identifiers, with no primary category inferred from display order. Use the plan's fixed labels and identifiers.

### Category identifiers and discovery (S1-CAT-R01/02)

Use these stable, case-sensitive string identifiers. Display labels are presentation text, never identifiers or inferred clinical classifications.

| Identifier | Interface label |
|---|---|
| `BLOOD_TESTS` | Blood tests |
| `VITAMINS_MINERALS` | Vitamins & minerals |
| `THYROID` | Thyroid |
| `LIVER` | Liver |
| `KIDNEY` | Kidney |
| `LIPIDS` | Lipids |
| `DIABETES` | Diabetes |

Clients obtain the supported values and labels from this versioned contract and keep a fixed mapping in their UI. There is no category discovery HTTP endpoint, catalog-count-based discovery, category CRUD, or runtime label management in Stage 1. Show all seven choices even if a category has no matching tests. A future taxonomy change requires an explicit contract change. "All" means omit `category`; it is never a stored value or a valid filter identifier. This avoids adding a route solely for seven fixed choices.

### Confirmed business decisions (2026-10-27)

| Decision | Owner-confirmed rule | Design consequence |
|---|---|---|
| S1-CAT-D01: category cardinality | A test may belong to multiple categories; categories may contain multiple tests. | Zero-to-many fixed identifiers per test, stored as assignment rows; array DTO field. |
| S1-CAT-D02: category requirement and uncategorized visibility | Categories are optional for existing and new tests. Active tests with no categories remain visible in "All". | No required assignment or automatic backfill; unassigned active tests also retain direct detail access. |

These decisions replace the earlier single-category proposal. Technical choices below finalize the target contract; Task 2 storage/mapping and Task 3 assignment/response arrays are implemented. No clinical test-to-category mapping has been approved, and none may be inferred from names or sample types. Task 1 was documentation only; Task 4 adds membership queries and list availability policy. Task 5 remains TODO and unexecuted.

### Category assignment and legacy handling (S1-CAT-R04)

Add optional `categories` to POST/PUT requests and a non-null `categories` array to every test response, including list, detail, create, replace, and status. Responses use `[]` when unassigned, never null or a singular `category` property. The array represents a set of at most seven unique string identifiers. Request order is immaterial; responses use the order of the identifier table above, without implying priority. Persist no array position or primary-category flag.

POST omission, explicit null, or `[]` creates an uncategorized test. PUT omission, null, or `[]` clears all assignments, matching existing replacement semantics for optional fields; a nonempty array replaces the complete set rather than appending. PUT remains a full replacement of catalog fields and preserves availability. PATCH status retains its existing boolean contract and preserves all category assignments. Only ADMIN may assign or clear categories; there is no separate assignment endpoint.

Reject duplicate identifiers, more than seven entries, null elements, empty/blank strings, labels, unknown identifiers, lowercase variants, and whitespace-padded identifiers with 400 `VALIDATION_ERROR` and `fieldErrors.categories`. The body member must be an array or null; a scalar/object body member, or a non-null array element of a non-string JSON type, returns 400 `INVALID_JSON`. Do not silently deduplicate or coerce strings. Query validation continues to use the singular field name `category`.

Preserve every existing row, identifier, price, text field, timestamp, and availability during schema expansion; create no assignment rows for legacy tests. An empty assignment set is unassigned, not an eighth category. Unassigned tests follow ordinary availability rules in unfiltered lists/details; filtering by any named category excludes them. Categorization does not activate/deactivate a test. An administrator may later replace assignments through PUT, atomically with catalog-field updates under the existing transaction and test-row lock. Validation failure rolls back the whole write. No historical data or future order snapshot is reclassified automatically. The database composite primary key prevents duplicate assignments even if another write path bypasses DTO validation.

### List query and availability contract (S1-CAT-R02/03)

`GET /api/lab-tests` keeps the current page envelope. A category filter matches a test if any assignment equals that exact identifier. Return its complete `categories` array, not just the matched identifier. A test assigned to BLOOD_TESTS and THYROID appears under either filter and appears once in "All". Combine search, membership, and effective availability with AND; calculate totals from distinct visible tests after all filters. Use an existence predicate (or equivalent unique-test query) so assignment joins cannot duplicate content or inflate totals before pagination. Preserve the UUID sorting tie-breaker.

| Parameter | Default / target behavior | Validation |
|---|---|---|
| `search` | Empty; case-insensitive literal substring of code OR name | Trimmed, at most 150 characters; `%`, `_`, and backslash remain literal |
| `category` | Omitted: all tests, including unassigned, subject to availability. Supplied: tests assigned to that identifier. | Exactly one identifier from the table; blank, `All`, `null`, comma-separated values, and unknown identifiers are invalid |
| `active` | Staff: omitted includes both states; true/false filters accordingly. PATIENT: omitted or true returns active only; false returns 403 `FORBIDDEN`. | Exact lowercase `true` or `false`; blank and other spellings return 400 |
| `page` | 0 | Decimal digits, integer 0 through 2147483647 |
| `size` | 20 | Decimal digits, integer 1 through 100 |
| `sort` | `name,asc` | `code`, `name`, `price`, `createdAt`, or `updatedAt`, followed by `,asc` or `,desc`; category sorting is not introduced |

Each supported parameter may occur at most once, even when repeated values are identical; repetition returns 400 `VALIDATION_ERROR` keyed to that parameter. Preserve the current handling of unknown query keys (ignored); they must never override patient visibility. Validate supported parameter syntax before the patient `active=false` policy check: malformed/repeated `active` returns 400, while one well-formed `active=false` returns 403 for PATIENT. A category with no matches and a page beyond the filtered result set return 200 with empty `content`; preserve existing page metadata semantics. Blank search is allowed. Multiple assigned categories do not introduce a multi-category query: the screen selects one category at a time.

### Target permissions

All endpoints require the existing eligible authenticated account; no anonymous discovery is added. Catalog reads are shared catalog access and require no patient-profile ownership or profile creation. Staff permissions apply to ADMIN, RECEPTIONIST, and LAB_TECHNICIAN as shown; only ADMIN writes. Preserve bearer/cookie authentication, cookie-write CSRF enforcement, and existing CORS rules.

| Operation | ADMIN | RECEPTIONIST | LAB_TECHNICIAN | PATIENT |
|---|---|---|---|---|
| Read active tests | Yes | Yes | Yes | Yes |
| Read inactive tests | Yes | Yes | Yes | No |
| Create/replace tests and category assignments | Yes | No | No | No |
| Activate/deactivate tests | Yes | No | No | No |

`GET /api/lab-tests/{id}` returns 200 for a visible test. A valid UUID that is missing or belongs to an inactive test requested by PATIENT returns the same 404 `LAB_TEST_NOT_FOUND` message and empty `fieldErrors`; do not disclose the inactive record. Malformed UUIDs retain 400 `VALIDATION_ERROR` on `id`. Enforce visibility in backend list/detail service logic, independently of UI controls and supplied filters.

### Responses, errors, retries, and examples

Preserve existing status codes and `{code,message,fieldErrors,requestId}` errors. Extend 400 `VALIDATION_ERROR` to invalid category query/assignment values; extend 403 `FORBIDDEN` to a patient's explicit inactive list request, with empty `fieldErrors`. Extend 404 `LAB_TEST_NOT_FOUND` to a patient's inactive detail request. Missing/invalid authentication stays 401; forbidden writes/invalid cookie CSRF stay 403; duplicate normalized code stays 409 `LAB_TEST_CODE_IN_USE`. Existing JSON, method, content-type, and unexpected-error behavior above still applies. No new category-not-found status or error envelope is needed for a fixed vocabulary.

GET requests have no writes or external side effects and may be retried. POST has no idempotency key: a retry with the same normalized code may return 409, so reconcile through existing reads before retrying after an uncertain outcome. PUT and PATCH can repeat the same desired state, but timestamps may advance; they do not guarantee byte-identical responses. Reuse existing transactional writes and row locking; this slice adds no email, order, payment, or other workflow side effects. Do not automatically retry validation/authorization failures.

Implemented categorized create/replace body (synthetic catalog example, not an approved clinical mapping):

```json
{
  "code": "DEMO_CAT",
  "name": "Synthetic catalog example",
  "description": null,
  "price": 25.50,
  "currency": "ILS",
  "sampleType": "Example specimen",
  "preparationInstructions": null,
  "categories": ["BLOOD_TESTS", "THYROID"]
}
```

Example list: `GET /api/lab-tests?category=BLOOD_TESTS&search=DEMO&page=0&size=20&sort=name,asc`. A 200 response with one matching active test is below. Filtering by `category=THYROID` also matches this test and returns both assignments.

```json
{
  "content": [{
    "id": "11111111-1111-4111-8111-111111111111",
    "code": "DEMO_CAT",
    "name": "Synthetic catalog example",
    "description": null,
    "price": 25.50,
    "currency": "ILS",
    "sampleType": "Example specimen",
    "preparationInstructions": null,
    "active": true,
    "createdAt": "2026-10-27T09:00:00Z",
    "updatedAt": "2026-10-27T09:00:00Z",
    "categories": ["BLOOD_TESTS", "THYROID"]
  }],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1,
  "first": true,
  "last": true
}
```

Detail/create/replace/status return the single object inside `content`, with POST additionally returning 201 and `Location: /api/lab-tests/{id}`. Unassigned records have `"categories": []`. For example, the following full create/replace body creates or replaces an uncategorized test; omission/null of `categories` has the same effect:

```json
{
  "code": "DEMO_NONE",
  "name": "Synthetic uncategorized example",
  "description": null,
  "price": 25.50,
  "currency": "ILS",
  "sampleType": "Example specimen",
  "preparationInstructions": null,
  "categories": []
}
```

Its response is the same test DTO shape above with its server-assigned UUID/timestamps, these catalog fields, `active: true` on creation, and `categories: []`. It appears in an unfiltered patient list while active, but not under `category=BLOOD_TESTS` or any other category filter. A first empty page has `content: []`, `totalElements: 0`, `totalPages: 0`, `first: true`, and `last: true`.

Examples of query failures (request IDs are synthetic; the inactive-detail example remains a Task 5 target):

```json
{"code":"VALIDATION_ERROR","message":"Invalid value.","fieldErrors":{"category":"Invalid value."},"requestId":"22222222-2222-4222-8222-222222222222"}
```

The above is 400 for `?category=All`. A body containing `"categories": ["THYROID", "THYROID"]` is also 400, with the same envelope and `fieldErrors: {"categories":"Invalid value."}`. For a PATIENT, `?active=false` returns 403:

```json
{"code":"FORBIDDEN","message":"Access denied.","fieldErrors":{},"requestId":"33333333-3333-4333-8333-333333333333"}
```

Task 5 target (not implemented): a PATIENT requesting an inactive test by valid UUID receives 404:

```json
{"code":"LAB_TEST_NOT_FOUND","message":"Laboratory test not found.","fieldErrors":{},"requestId":"44444444-4444-4444-8444-444444444444"}
```

### Task 1 acceptance review

Fields, filters, and actions were reviewed against the available catalog screenshot, written plan, and existing source. Stable identifiers/labels, static discovery, array request/response rules, membership filtering, errors, target permissions, legacy handling, and the [assignment-table design in DATABASE_DESIGN.md section 4.4a](DATABASE_DESIGN.md#44a-stage-1-category-design-task-1) are aligned. S1-CAT-D01/D02 are resolved by the owner's explicit multiple/optional category decisions. Task 1 is DONE; its documentation-only review ran no application, tests, migrations, or database operations. Task 2 subsequently implements storage/mapping with separately recorded focused verification. Task 3 implements assignment/response arrays with focused verification recorded below. Task 4 implements membership queries and patient list availability with separate focused evidence. Task 5 remains TODO; inactive-detail restrictions and final stage verification are still future work.

## Verification

Historical full-suite evidence: [TESTING.md](TESTING.md#verification-after-launcher-removal-2026-10-27) records 141 tests across 17 suites passing on the isolated cluster on 2026-10-27, including the catalog suites. That historical documentation review performed source/document checks only. Task 3 evidence is recorded separately in [TESTING.md](TESTING.md#task-3-administrative-category-assignment-verification-2026-10-28); current Task 4 commands/results are in the [Task 4 verification record](TESTING.md#task-4-catalog-list-filtering-verification-2026-10-28). On Windows use `.\mvnw.cmd` directly as documented there.

Run `.\mvnw.cmd '-Dtest=LabTestRequestTest,LabTestServiceTest,LabTestErrorHandlerTest,BrowserSecurityTest' test` from Backend for database-free verification. Unit tests cover normalization, validation, strict JSON types, query limits, service authorization, status preservation, and concurrent-constraint error translation. `LabTestManagementTest` additionally covers real PostgreSQL persistence, HTTP security, literal searching, pagination, and concurrent creation. Like the existing integration suites it runs only when `SMARTLIMS_TEST_DATABASE_URL` points to `jdbc:postgresql://127.0.0.1:<port>/smartlims_auth_regression`, using user postgres and an empty password. Use only a dedicated disposable database: integration fixtures truncate its application tables.

The integration suite also checks database defaults and constraints, persisted timestamps for identical PUT/status writes, duplicate codes on create/update, and cookie authentication with missing, mismatched, and valid CSRF tokens for every write and role. Before running it, independently confirm that the configured PostgreSQL instance/database is isolated and disposable; the URL pattern alone does not establish isolation. Never point it at a development or shared database.
