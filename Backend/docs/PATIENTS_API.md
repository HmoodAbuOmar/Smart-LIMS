# Smart-LIMS Patients API Contract

Status: patient management phases 1 and 2 implemented with canonical V3/V5 schema alongside V4 lab catalog. Saved operator artifacts record development reconciliation completed on 2026-10-26; see [database evidence and limits](DATABASE_DESIGN.md#11-implemented-migrations-and-recorded-reconciliation). Earlier preparation/audit sections describe their own historical boundaries and are not the current migration status. The original 2026-10-27 documentation-only review did not access a database.
My Profile extension (section 16): DONE, 2026-10-30; Tasks 33-36, MP-PAT-R01-R06. Final direct isolated suite: 367 tests/49 suites, zero failures/errors/skips; [current verification](TESTING.md#my-profile-verification-2026-10-30).
Reviewed: original phases 2026-10-27; My Profile extension 2026-10-30.
Repository location: `Backend/docs/PATIENTS_API.md`.
Database reference: `Backend/docs/DATABASE_DESIGN.md`.

Traceability: R-PAT-01, R-PAT-02, R-NFR-01 and T-PAT-01 in the [backend SDLC index](../IMPLEMENTATION_PLAN.md). Historical verification is in sections 13 and 15 plus the later [full isolated-suite record](TESTING.md#verification-after-launcher-removal-2026-10-27). The historical documentation review ran no tests. My Profile Tasks 33-36/MP-PAT-R01-R06 add the narrowly scoped self-update in section 16; deletion, merge and reassignment remain excluded. Current execution evidence belongs in TESTING.md.

## 1. Purpose and phase boundary

A user account authenticates a person and assigns their role. A patient profile is the laboratory record to which future orders and results will belong.

Public registration creates only a `users` account with role PATIENT and requires `fullName`, `email`, `password`, and matching `confirmPassword`; account username and phone are left null. See [Registration contract](AUTH_API.md). Registration/login do not automatically create/link a patient profile. Phase 2 adds explicit authenticated self-creation and token-based linking.

Account and patient-profile `fullName` values are independent and never automatically synchronized. Patient-profile creation still requires its own `fullName`, date of birth, gender, and `phoneNumber`, even when the account has no phone number.

Phase 1 supports staff-created, unlinked patient profiles, staff search, profile retrieval, and staff updates. It also defines ownership-protected retrieval for an account that already has a legitimate profile link.

Phase 2 adds GET/POST `/me`, staff-issued link tokens, and POST `/me/link`. All four original endpoints retain their existing contracts. My Profile adds GET/PUT `/me/profile` (section 16); original PUT `/{id}` remains staff-only. Profile/account demographics remain separate.

Out of scope:

- Unlinking/reassignment and account/security edits through patient-profile APIs.
- Automatically matching profiles by name or phone.
- Profile deletion, merging, orders, bookings, results, or payment operations.
- Changes to authentication, JWT, cookies, CORS, or CSRF behavior.

A PATIENT with no linked profile uses the explicit phase-2 workflow, never the staff-only phase-1 create endpoint. Linking requires an eligible, email-verified account and a valid staff-issued opaque token.

## 2. Database model and relationships

| Column | Type | Nullable | Constraint / responsibility |
|---|---|---|---|
| id | UUID | No | Primary key; server generated |
| patient_number | VARCHAR(30) | No | Unique; server generated from a PostgreSQL sequence |
| user_id | UUID | Yes | Unique FK to users.id; NULL on staff creation, authenticated account on self-creation/linking |
| full_name | VARCHAR(120) | No | Trimmed nonblank patient name |
| date_of_birth | DATE | No | Valid birth date; not in the future |
| gender | VARCHAR(10) | No | MALE, FEMALE, UNKNOWN |
| phone_number | VARCHAR(20) | No | Trimmed nonblank contact number; not unique |
| address | TEXT | Yes | Optional address |
| created_by | UUID | No | FK to users.id; authenticated creator |
| created_at | TIMESTAMPTZ | No | Server creation time |
| updated_at | TIMESTAMPTZ | No | Server last-update time |

Relationships:

- `patients.user_id -> users.id`: optional one-to-one account link. A linked account must have role PATIENT. Several NULL links are allowed.
- `patients.created_by -> users.id`: the authenticated creator; staff for walk-ins, the patient account for self-creation. It remains unchanged on linking.
- Future `test_orders.patient_id -> patients.id`: one profile may have many orders. This phase does not implement orders.
- Keep referenced profiles/accounts under the documented RESTRICT/NO ACTION policy; do not add cascading deletion of clinical history.

There is no identity-number or blood-type field. Phone numbers, names, and birth dates are not unique identifiers. Two profiles with identical submitted details are not automatically rejected or merged.

## 3. Endpoint and permission matrix

Base path: `/api/patients`.
All endpoints require authentication. No anonymous access is allowed.

| Endpoint | ADMIN | RECEPTIONIST | LAB_TECHNICIAN | PATIENT |
|---|---|---|---|---|
| POST /api/patients | Allowed | Allowed | Forbidden | Forbidden |
| GET /api/patients | Allowed | Allowed | Allowed | Forbidden |
| GET /api/patients/{id} | Allowed | Allowed | Allowed | Own linked profile only |
| PUT /api/patients/{id} | Allowed | Allowed | Forbidden | Forbidden |
| GET /api/patients/me | Forbidden | Forbidden | Forbidden | Own profile; 404 if absent |
| POST /api/patients/me | Forbidden | Forbidden | Forbidden | Verified and eligible; one profile per account |
| POST /api/patients/{id}/link-tokens | Allowed | Allowed | Forbidden | Forbidden |
| POST /api/patients/me/link | Forbidden | Forbidden | Forbidden | Verified and eligible; token required |
| GET /api/patients/me/profile | Forbidden | Forbidden | Forbidden | Own My Profile view, account email and completion |
| PUT /api/patients/me/profile | Forbidden | Forbidden | Forbidden | Replace own linked patient demographics only |

Check both role and ownership on the backend. UI visibility is not authorization.

For a PATIENT requesting a valid UUID that is nonexistent or not their linked profile, return 404. This avoids distinguishing another patient's existing profile from a nonexistent one. Ownership is checked using authenticated account ID and `patients.user_id`, never a request-supplied account ID.

No DELETE endpoint is defined.

## 4. Authentication and transport

Use the existing project authentication mechanisms. Postman bearer example:

```http
Authorization: Bearer <access_token>
Accept: application/json
```

POST and PUT additionally use:

```http
Content-Type: application/json
```

If cookie authentication is used, follow the existing CSRF token acquisition/header/cookie flow. Obtain the `XSRF-TOKEN` cookie from `GET /api/auth/csrf-token` and send its value in `X-XSRF-TOKEN` on writes, along with the `access_token` cookie. Explicit bearer authentication takes precedence over cookies and follows the existing bearer CSRF exemption. Do not disable CSRF or broaden CORS for this module. This contract does not introduce a new login or token format.

The existing CSRF filter runs before authentication: POST/PUT without bearer credentials and without a valid CSRF cookie/header return 403 `FORBIDDEN`, including anonymous requests. Anonymous GET requests, and anonymous writes that pass CSRF, return 401 `UNAUTHORIZED`.

JSON property names use camelCase; database columns use snake_case.
Dates use `YYYY-MM-DD`. Response timestamps use ISO 8601 UTC with `Z`; UI code may display Asia/Jerusalem time.

## 5. Create patient

### Request

```http
POST /api/patients
```

Authorized: ADMIN, RECEPTIONIST.

Request body:

```json
{
  "fullName": "Example Patient",
  "dateOfBirth": "2003-05-12",
  "gender": "MALE",
  "phoneNumber": "0591234567",
  "address": "Example Address"
}
```

| Property | Required | Rules |
|---|---|---|
| fullName | Yes | String; trim; 1-120 characters after trimming |
| dateOfBirth | Yes | ISO date; valid and not later than the current Asia/Jerusalem date |
| gender | Yes | Exact uppercase enum: MALE, FEMALE, UNKNOWN |
| phoneNumber | Yes | String; trim; 1-20 characters; retain leading zeros; no uniqueness restriction |
| address | No | String or null; trim; omitted/null/blank becomes NULL; maximum 500 characters at API boundary |

Do not require a particular country's phone prefix or silently convert the contact number. The initial contract validates presence/length, not international phone ownership or format.

The following fields are forbidden in the body: id, patientNumber, userId, createdBy, createdAt, updatedAt. Unknown JSON properties return 400, consistent with the existing strict JSON configuration.

Server responsibilities:

1. Validate the authenticated actor is ADMIN or RECEPTIONIST.
2. Normalize and validate the permitted input fields.
3. Generate UUID and the next patient number, e.g. PAT-000001; padding is a minimum width, not a six-digit cap. Sequence gaps are allowed.
4. Set user_id = NULL and created_by = authenticated account ID.
5. Assign creation/update timestamps and insert the record transactionally.
6. Return the saved response DTO.

### Success

Status: `201 Created`.
Header: `Location: /api/patients/{id}`.

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "patientNumber": "PAT-000001",
  "fullName": "Example Patient",
  "dateOfBirth": "2003-05-12",
  "gender": "MALE",
  "phoneNumber": "0591234567",
  "address": "Example Address",
  "createdAt": "2026-10-08T15:30:00Z",
  "updatedAt": "2026-10-08T15:30:00Z"
}
```

Potential errors: 400 invalid body; 401 unauthenticated; 403 unauthorized role. Unexpected persistence failures use existing server-error handling; do not expose SQL or constraint names.

## 6. List/search patients

### Request

```http
GET /api/patients?search=Example&page=0&size=20&sort=createdAt,desc
```

Authorized: ADMIN, RECEPTIONIST, LAB_TECHNICIAN.

| Query parameter | Default | Validation / behavior |
|---|---|---|
| search | No filter | Trim; empty means no filter; maximum 120 characters |
| page | 0 | Zero-based integer >= 0 |
| size | 20 | Integer from 1 to 100 |
| sort | createdAt,desc | Exactly one `<field>,<direction>` expression |

Allowed sort fields: patientNumber, fullName, dateOfBirth, createdAt, updatedAt.
Allowed directions: asc, desc. Other fields, malformed expressions, repeated sort parameters, and invalid page/size/search values return 400. Repeated page, size, or search parameters also return 400. Page accepts integers from 0 through 2147483647; integer overflow and blank numeric parameters are rejected. Blank search is accepted after trimming; blank sort is rejected.

Search semantics:

- Literal, case-insensitive substring of fullName or patientNumber.
- Literal substring of phoneNumber.
- Use OR across these three fields; no birth-date/address/account search in this phase.
- Treat `%` and `_` as literal input, not user-provided SQL wildcard instructions; escape them when constructing LIKE/ILIKE queries.
- Use parameterized queries. Append `id ASC` as a deterministic tie-breaker after the requested sort.

### Success

Status: `200 OK`.
Use a stable custom paginated DTO, not raw Spring Page serialization.

```json
{
  "content": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "patientNumber": "PAT-000001",
      "fullName": "Example Patient",
      "dateOfBirth": "2003-05-12",
      "gender": "MALE",
      "phoneNumber": "0591234567",
      "address": "Example Address",
      "createdAt": "2026-10-08T15:30:00Z",
      "updatedAt": "2026-10-08T15:30:00Z"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1,
  "first": true,
  "last": true
}
```

No matches: return 200 with empty content, totalElements = 0, totalPages = 0, first = true, last = true for page 0. A page beyond the available results returns empty content with the requested page number and the actual totals; it is not 404.

Potential errors: 400 invalid query; 401 unauthenticated; 403 unauthorized role.

## 7. Get patient profile

### Request

```http
GET /api/patients/11111111-1111-4111-8111-111111111111
```

Authorized: ADMIN, RECEPTIONIST, LAB_TECHNICIAN; PATIENT only for their own linked profile.

Path id must be a valid UUID; malformed UUID returns 400.

Staff: fetch by profile ID; nonexistent profile returns 404.
PATIENT: fetch by profile ID and authenticated user_id; nonexistent/unlinked/not-owned profile returns 404. Do not load another patient's profile into a response before the ownership check.

### Success

Status: `200 OK`.
Response: the same PatientResponse shape as create.

Potential errors: 400 malformed UUID; 401 unauthenticated; 403 role outside allowed roles; 404 missing or inaccessible profile.

## 8. Update patient profile

### Request

```http
PUT /api/patients/11111111-1111-4111-8111-111111111111
```

Authorized: ADMIN, RECEPTIONIST.

```json
{
  "fullName": "Example Patient",
  "dateOfBirth": "2003-05-12",
  "gender": "MALE",
  "phoneNumber": "0597654321",
  "address": null
}
```

This PUT replaces the permitted demographic/contact fields; it is not a partial update.

- fullName, dateOfBirth, gender, and phoneNumber are required each time.
- address may be omitted, null, or blank; all clear the stored address to NULL.
- Apply the same normalization and validation rules as create.
- id, patientNumber, user_id, created_by, and created_at remain unchanged.
- Assign updated_at on successful update.
- Changing a linked profile does not automatically change users.full_name or users.phone_number.
- Keep this operation transactional. Do not claim stale-update detection: phase 1 has no ETag/version precondition, so concurrent staff updates use last-committed-write behavior.
- Do not change historical published result snapshots when profile data changes in later phases.

### Success

Status: `200 OK`.
Response: the updated PatientResponse shape.

Potential errors: 400 invalid UUID/body; 401 unauthenticated; 403 unauthorized role; 404 nonexistent profile.

## 9. Shared response DTO

| JSON property | Type | Nullable |
|---|---|---|
| id | UUID string | No |
| patientNumber | String | No |
| fullName | String | No |
| dateOfBirth | ISO date string | No |
| gender | Enum string | No |
| phoneNumber | String | No |
| address | String | Yes |
| createdAt | ISO timestamp string | No |
| updatedAt | ISO timestamp string | No |

Return address explicitly as null when absent.
Do not return account entities, email/password/reset data, userId, or createdBy in this phase's shared public DTO. Those relationships remain database/service concerns; staff audit data can be added through a separately scoped contract later.

Do not include calculated age in this DTO; clients can calculate age from dateOfBirth for display. Reference-range calculations later use age at measurement time, not current age.

## 10. Errors and HTTP status semantics

`com.smartlims.patients.exception.PatientErrorHandler` handles patient exceptions, Bean Validation, JSON errors, and unexpected patient failures using the existing `AuthErrorHandler.ApiError` envelope. Patient services and query DTOs throw patient-specific exceptions rather than `AuthRequestException`. `AuthErrorHandler` is scoped to authentication controllers, and `JsonSecurityErrorHandler` continues to handle security-filter failures. Authentication error behavior is unchanged.

Every handled error below has this JSON structure:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Please correct the request fields.",
  "fieldErrors": {
    "fullName": "Invalid value."
  },
  "requestId": "33333333-3333-4333-8333-333333333333"
}
```

`fieldErrors` is always an object, and is `{}` for errors without field details. Each response has `Cache-Control: no-store` and `X-Request-Id` equal to the response `requestId`. Request IDs are generated by the server; the value above is illustrative.

| HTTP status | Exact code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/null required fields, blank required strings, excessive length, future birth date, malformed UUID, invalid pagination/sort/search |
| 400 | `INVALID_JSON` | Malformed JSON, invalid date/enum, non-string name/phone/address, non-string birth date, forbidden or unknown JSON properties |
| 401 | `UNAUTHORIZED` | No accepted credentials, expired/invalid token, or account no longer eligible; subject to the CSRF precedence described above |
| 403 | `FORBIDDEN` | Authenticated role cannot call the operation, or existing CSRF protection rejects a write |
| 404 | `PATIENT_NOT_FOUND` | Staff ID does not exist; patient ID does not exist or is not linked to the authenticated patient |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected patient-module failure; no SQL or sensitive internals |

Bean Validation uses the message `Please correct the request fields.` and maps each invalid field to `Invalid value.`. Service checks for future dates and UUIDs, and query DTO validation, use the same code and top-level message, with the affected field mapped to `Please correct the request fields.`. JSON parsing errors use `Invalid request body.` and empty field errors. These examples reflect the tested implementation:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Please correct the request fields.",
  "fieldErrors": { "dateOfBirth": "Please correct the request fields." },
  "requestId": "33333333-3333-4333-8333-333333333333"
}
```

```json
{
  "code": "INVALID_JSON",
  "message": "Invalid request body.",
  "fieldErrors": {},
  "requestId": "33333333-3333-4333-8333-333333333333"
}
```

```json
{
  "code": "PATIENT_NOT_FOUND",
  "message": "Patient not found.",
  "fieldErrors": {},
  "requestId": "33333333-3333-4333-8333-333333333333"
}
```

Security messages are `Authentication is required.` for 401 and `Access is denied.` for 403. Unexpected patient failures use `An unexpected error occurred.`. The existing security class also defines an `INVALID_AUTH_TRANSPORT` helper, but no active call site was found; it is not a claimed phase-1 response.

409 is not a duplicate-demographics error. Patient numbers are server generated; phone/name/birth date are not unique. Repeated staff create requests may create separate records because that POST has no idempotency key. Self-create rejects a second account/profile link with 409 as described in section 15. Do not silently deduplicate by demographics.

Patient ownership failures deliberately share the exact `PATIENT_NOT_FOUND` message and shape with missing records.

## 11. Examples of rejected input

### Future birth date

```json
{
  "fullName": "Example Patient",
  "dateOfBirth": "2100-01-01",
  "gender": "MALE",
  "phoneNumber": "0591234567"
}
```

Expected: 400.

### Client-supplied account link

```json
{
  "fullName": "Example Patient",
  "dateOfBirth": "2000-01-01",
  "gender": "FEMALE",
  "phoneNumber": "0591234567",
  "userId": "22222222-2222-4222-8222-222222222222"
}
```

Expected: 400 because userId is not part of the allowed input DTO.

### Shared family phone

Two different profiles may both use `0591234567`.
Expected: both creations may succeed; no phone-uniqueness conflict.

## 12. Postman verification checklist

1. Log in as ADMIN or RECEPTIONIST using the existing login endpoint.
2. Create a profile with all required fields; expect 201 and Location.
3. Create another profile with the same phone; expect success and a different patientNumber/id.
4. Confirm the persisted user_id is NULL and created_by matches the authenticated staff account.
5. Get the created profile; expect the agreed DTO.
6. Search by name, file number, and phone; verify pagination, sorting, literal wildcard treatment, and empty results.
7. Update the permitted fields; verify createdAt/patientNumber remain unchanged and updatedAt advances when the update occurs later.
8. Reject invalid fields, future dates, unauthorized fields, malformed UUIDs, and invalid pagination/sort.
9. LAB_TECHNICIAN may list/get but may not create/update.
10. PATIENT may not list/create/update through staff endpoints; their own linked profile is readable, while another profile returns 404. Test phase-2 self-creation/linking separately as described below.
11. Anonymous GET calls fail with 401; anonymous writes fail with 401 after valid CSRF transport, or 403 when CSRF validation fails first. If testing cookies, follow the existing CSRF flow and test its protection.
12. Re-run relevant authentication tests to ensure existing behavior remains unchanged.

## 13. Implemented details and verification

- `V3__patients.sql` adds `patient_number_seq` and `patients`. V1 and V2 are unchanged. Unique patient numbers/account links, gender checks, nonblank name/phone checks, and non-cascading user foreign keys are enforced. FK and default-list-order indexes are included.
- The layer refactor leaves all three migrations, the schema, and the sequence unchanged.
- The module is under `com.smartlims.patients`: `controller` handles HTTP transport; `dto` owns request normalization/validation and response records; `service` owns application operations, role/ownership checks, field assignments, and transactions; `entity` holds persistence mappings, constructors, getters, and the required setters; `repository` handles persistence; `mapper.PatientMapper` converts entities/pages to responses; `exception` contains patient exceptions and `PatientErrorHandler`; `specification.PatientSpecifications` supplies reusable literal search predicates.
- Staff-created profiles have `user_id = NULL`; `created_by` is the current authenticated staff account. Phase-2 self-creation/linking uses current-account eligibility/role checks, row locks, and an explicit linkAccount operation that rejects reassignment.
- UUIDs follow the existing JPA generation strategy. Sequence numbers are formatted as `PAT-%06d` using a minimum width, and are allocated independently of transaction rollback. Timestamps are persisted before building write responses; successful PUT requests update `updated_at`, including unchanged payloads.
- `PatientService` creates the entity using its patient-number/creator constructor. It explicitly sets `updated_at` before flushing PUT updates so identical payloads still persist a new timestamp. There are no generated-ID, created-at, patient-number, or creator setters. linkAccount is used by the creation/linking workflow; staff updates lock the profile so concurrent linking is preserved.
- HTTP query parameters are converted to a validated `PatientQueryRequest` before calling the service. It owns normalization, defaults, numeric/sort validation, repeated-known-parameter rejection, and the existing first-error ordering. The service owns sort execution, the stable ID tie-breaker, and the distant-page count fallback.
- Text normalization runs before length validation. Module-scoped JSON deserializers require string name/phone/address fields and a valid string `YYYY-MM-DD` birth date; gender requires an exact uppercase enum string. Existing authentication JSON coercion settings are unchanged.
- Patient-owned reads use `findByIdAndUser_Id`; search uses parameterized JPA criteria with escaped literal LIKE patterns and `id ASC` after the whitelisted sort. Very distant pages beyond the result count are answered without overflowing JPA's integer offset.
- Existing authentication, cookie, CSRF, CORS, registration, and invitation flows remain in place. Authentication regression cleanup now includes `patients` because its foreign keys retain user references.

Verified patient checks after the layer refactor: `PatientRequestTest` (3 tests) and `PatientManagementTest` (27 tests including parameterized cases), all passing with no skips. They cover normalization, query DTO defaults/bounds and first-error ordering, repeated known query parameters and exact error messages, persistence, shared phone/duplicate demographics, timestamp/identity preservation including identical PUT, linked-profile update isolation, all role permissions, ownership concealment, current account role/eligibility, anonymous access, cookie CSRF, literal wildcard/backslash search, sorting/tie-breaking, pagination/empty pages, input rejection, sanitized unexpected errors, migration history, unique links/numbers, foreign keys, and 12 concurrent creates plus seven-digit patient-number formatting.

Tests use a freshly initialized, temporary PostgreSQL 16 cluster bound to loopback and the guarded `smartlims_auth_regression` database. Hibernate schema validation and Flyway validation run in the test context. No development database is used.

Full verification after the layer refactor: `mvnw.cmd clean verify -Dspring.test.mockmvc.print=NONE` passed all 60 tests with zero failures, errors, or skips, including 21 authentication regression cases, browser security, provisioning, and application context checks. The executable JAR was built successfully.

Commands:

```powershell
.\mvnw.cmd -q -DskipTests compile
.\mvnw.cmd '-Dtest=PatientRequestTest' test
$env:SMARTLIMS_TEST_DATABASE_URL = 'jdbc:postgresql://127.0.0.1:<isolated-port>/smartlims_auth_regression'
.\mvnw.cmd '-Dtest=PatientManagementTest,PatientRequestTest' test
.\mvnw.cmd verify '-Dspring.test.mockmvc.print=NONE'
.\mvnw.cmd clean verify '-Dspring.test.mockmvc.print=NONE'
```

The guarded integration suites are skipped unless the explicitly isolated database URL is provided. Manual Postman runs and migration against a shared/development database are not performed by these checks.

## 14. Postman request examples

Use environment variables `baseUrl` (for example `http://localhost:8080`), `accessToken`, and `patientId`. All profile details below are synthetic.

First authenticate an existing authorized account:

```http
POST {{baseUrl}}/api/auth/login
Content-Type: application/json

{
  "emailOrUserName": "<existing staff email or username>",
  "password": "<existing account password>"
}
```

Postman post-response script:

```javascript
pm.environment.set("accessToken", pm.response.json().accessToken);
```

Configure the patient requests' Authorization tab as Bearer Token `{{accessToken}}`.

```http
POST {{baseUrl}}/api/patients
Content-Type: application/json
Accept: application/json

{
  "fullName": "Example Patient",
  "dateOfBirth": "2000-01-01",
  "gender": "UNKNOWN",
  "phoneNumber": "000001",
  "address": "Example Address"
}
```

Expected: 201 and a Location header. Save the generated profile ID in a post-response script:

```javascript
pm.test("Patient created", () => pm.response.to.have.status(201));
pm.environment.set("patientId", pm.response.json().id);
```

```http
GET {{baseUrl}}/api/patients?search=Example&page=0&size=20&sort=fullName,asc
Accept: application/json
```

Expected: 200 and the custom page DTO. To search for literal `%` or `_`, use Postman's Params tab so values are URL encoded (for example `%25` for a percent sign).

```http
GET {{baseUrl}}/api/patients/{{patientId}}
Accept: application/json
```

Expected: 200 for authorized staff; PATIENT requires an already legitimate link, otherwise 404.

```http
PUT {{baseUrl}}/api/patients/{{patientId}}
Content-Type: application/json
Accept: application/json

{
  "fullName": "Example Patient Updated",
  "dateOfBirth": "2000-01-01",
  "gender": "UNKNOWN",
  "phoneNumber": "000002",
  "address": null
}
```

Expected: 200, unchanged id/patientNumber/createdAt, explicit null address, and an updated timestamp. Create/update require ADMIN or RECEPTIONIST; listing also permits LAB_TECHNICIAN.

## 15. Phase 2: self-profile and verified linking

All routes use existing authentication and CSRF transport rules in section 4. The literal `/me` route takes precedence over `/{id}`. Identity always comes from the authenticated account; no caller-supplied userId or createdBy is accepted. PATIENT accounts must satisfy current login eligibility: enabled, verified email, password present, and invitation accepted when applicable. Eligibility failures retain 401 UNAUTHORIZED; a currently unauthorized role receives 403 FORBIDDEN.

### 15.1. Get my profile

```http
GET {{baseUrl}}/api/patients/me
Authorization: Bearer {{patientAccessToken}}
Accept: application/json
```

PATIENT only. Resolve by the authenticated account's user_id. Success is 200 with the shared PatientResponse, without account/creator identifiers. If absent, return exactly this envelope (requestId is illustrative and server-generated):

```http
HTTP/1.1 404 Not Found
Cache-Control: no-store
X-Request-Id: 33333333-3333-4333-8333-333333333333
```

```json
{
  "code": "PATIENT_PROFILE_NOT_LINKED",
  "message": "No patient profile is linked to this account.",
  "fieldErrors": {},
  "requestId": "33333333-3333-4333-8333-333333333333"
}
```

The existing GET /{id} retains 404 PATIENT_NOT_FOUND for missing or inaccessible profiles.

### 15.2. Create my profile

```http
POST {{baseUrl}}/api/patients/me
Authorization: Bearer {{patientAccessToken}}
Content-Type: application/json
Accept: application/json

{
  "fullName": "Synthetic Profile",
  "dateOfBirth": "2000-01-01",
  "gender": "UNKNOWN",
  "phoneNumber": "000001",
  "address": null
}
```

Verified, eligible PATIENT only. Reuses CreatePatientRequest and every normalization/validation rule in section 5, including strict JSON and Asia/Jerusalem birth-date validation. Both user_id and created_by are derived from authentication. The server generates the UUID and sequence-based patientNumber. Success is 201 Created with Location: /api/patients/{id} and PatientResponse, for example:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "patientNumber": "PAT-000001",
  "fullName": "Synthetic Profile",
  "dateOfBirth": "2000-01-01",
  "gender": "UNKNOWN",
  "phoneNumber": "000001",
  "address": null,
  "createdAt": "2026-10-26T12:00:00Z",
  "updatedAt": "2026-10-26T12:00:00Z"
}
```

If the account already has any linked profile, return 409 PATIENT_LINK_CONFLICT. Concurrent self-create/claim requests share the same account-row lock, with the unique patients.user_id constraint as a backstop. There is no demographic lookup, merging, or deduplication. An unlinked staff-created profile with identical details remains separate. A patient who wants that existing record should use the staff-assisted token workflow instead of self-creation.

### 15.3. Issue or reissue a linking token

```http
POST {{baseUrl}}/api/patients/{{patientId}}/link-tokens
Authorization: Bearer {{staffAccessToken}}
Accept: application/json
```

ADMIN/RECEPTIONIST only; no body required. Staff must identify the correct unlinked profile and hand the capability to the intended patient through a trusted channel. Unknown profile: 404 PATIENT_NOT_FOUND; malformed UUID: 400 VALIDATION_ERROR; linked profile: 409 PATIENT_LINK_CONFLICT.

Success is 201 Created with Cache-Control: no-store and Pragma: no-cache:

```json
{
  "token": "<43-character opaque URL-safe token returned once>",
  "expiresAt": "2026-10-26T12:10:00Z"
}
```

The angle-bracket token above is a placeholder, not a usable credential. Tokens contain 32 random bytes, are valid for ten minutes with an exclusive expiry boundary, and are single-use. Only their lowercase SHA-256 hash is persisted in patient_link_tokens, with patient_id, issued_by, expires_at, consumed_at, and revoked_at. There is no token retrieval endpoint.

Reissuing locks the profile and revokes all prior outstanding tokens, including expired tokens, before inserting the replacement. A database partial unique index permits at most one outstanding token per profile. If two reissues race, only the last committed token remains usable.

QR rendering may encode the opaque token alone. A future browser link should carry it in a fragment handled by the client and submit it in the POST body; this backend does not implement a browser landing page. Do not include patient details, patient numbers as proof, or raw tokens in server query strings, logs, audit details, saved examples, or committed environment files. Request/response DTO toString methods redact token values.

### 15.4. Claim an existing profile

```http
POST {{baseUrl}}/api/patients/me/link
Authorization: Bearer {{patientAccessToken}}
Content-Type: application/json
Accept: application/json

{
  "token": "{{linkToken}}"
}
```

Verified, eligible PATIENT only. token is a required nonblank string with a 128-character input limit; numeric/object values and unknown fields are INVALID_JSON. Missing/null/blank/oversized token is VALIDATION_ERROR. A nonempty malformed token, unknown token, patient number, expired token, revoked token, or consumed token receives the same 400 response:

```json
{
  "code": "INVALID_PATIENT_LINK_TOKEN",
  "message": "Invalid or expired patient linking token.",
  "fieldErrors": {},
  "requestId": "33333333-3333-4333-8333-333333333333"
}
```

Success is 200 OK with the existing profile's PatientResponse. Linking never creates a profile or reassigns one. It preserves demographics, id, patientNumber, createdBy, and createdAt, and advances updatedAt. It never modifies users. The successful transaction consumes the token and assigns the authenticated account together.

For a still-valid token, an account already linked to any profile or a target profile already linked to any account receives 409:

```json
{
  "code": "PATIENT_LINK_CONFLICT",
  "message": "The account or patient profile is already linked.",
  "fieldErrors": {},
  "requestId": "33333333-3333-4333-8333-333333333333"
}
```

Conflict leaves a valid token unconsumed. Token validity is checked before link conflict, so replaying a successful claim returns INVALID_PATIENT_LINK_TOKEN even for the same account. Retry GET /me after an uncertain claim/create response; retrying a consumed token cannot relink it.

### 15.5. Atomicity and compatibility

- Self-create locks the current account. Claim locks account -> profile -> token; token usability and current account eligibility/role are checked within that transaction. Two claims against one token produce one success; different profile tokens cannot give one account two profiles.
- Issuance locks issuer -> profile before revoking token rows. Issuance and claim serialize on the profile: either the old token is consumed and issuance conflicts, or issuance revokes it and its claim fails. Expiry is evaluated after waiting for locks.
- Staff PUT locks the profile, preserving links during concurrent demographic updates. PUT /{id} remains a full replacement and staff-only. My Profile's later self-update uses a separate /me/profile route (section 16).
- V5 adds only patient_link_tokens and its constraints/indexes; applied V1-V4 and all existing authentication transports remain unchanged. No email delivery, orders, appointments, results, payments, dashboards, unlinking, or merging is added by this patient phase.

### 15.6. Separately managed Postman requests and backend verification

Postman requests are managed separately by the project owner. No generated collection files are maintained inside the project; generate them only when the owner explicitly requests it. The HTTP examples in sections 14 and 15.1-15.4 remain the reference for separately maintained requests.

Cover self-creation with missing-profile/conflict responses, and staff-issued linking with success, conflict, invalid-token, and replay responses. Use synthetic profiles and separate eligible test accounts, with a fresh patient account for each scenario. Keep credentials out of committed files and linking tokens in transient run variables; do not log them.

Database-backed regression checks require a freshly initialized, confirmed disposable PostgreSQL cluster bound to loopback. Never point these tests at a development or shared database; their fixtures truncate application tables. IsolatedPostgresTest additionally guards the URL/database name. Example command after creating such a cluster:

```powershell
$env:SMARTLIMS_TEST_DATABASE_URL = 'jdbc:postgresql://127.0.0.1:<disposable-port>/smartlims_auth_regression'
.\mvnw.cmd '-Dtest=PatientRequestTest,PatientLinkTokenTest,PatientProfileLinkingTest,PatientManagementTest' test '-Dspring.test.mockmvc.print=NONE'
.\mvnw.cmd verify '-Dspring.test.mockmvc.print=NONE'
```

PatientProfileLinkingTest covers persistence, hash-only storage, all roles, current eligibility, strict input, ownership, conflict rollback, expiry/revocation/replay, cookie CSRF, bearer precedence, and concurrent create/claim/reissue/staff-update operations. PatientLinkTokenTest covers the exact expiry boundary and token redaction. The phase-1 patient and authentication suites remain regression checks; see the phase-2 verification record below for actual results.

### 15.7. Phase-2 verification record (2026-10-26)

Historical verification before main's lab module was merged. Section 15.9 records the current combined V1-V5 verification.

- Production compilation passed using `.\mvnw.cmd -q -DskipTests compile`.
- Initial targeted patient run passed 57 tests with no failures/errors/skips. One additional concurrent staff-update/link test was then added and included in full verification.
- `.\mvnw.cmd verify '-Dspring.test.mockmvc.print=NONE'` passed all 88 tests with zero failures, errors, or skips and built the executable JAR. This includes PatientProfileLinkingTest (26), PatientLinkTokenTest (2), existing PatientManagementTest (27), PatientRequestTest (3), AuthenticationRegressionTest (21), and nine other browser-security/provisioning/password/context checks.
- Database checks used a freshly initialized temporary PostgreSQL 16.15 cluster, loopback only, on a dynamically allocated port. The database was confirmed empty before Flyway applied V1-V4. Hibernate schema validation and Flyway checksum validation passed. No development/shared database was used.
- Historical Postman collection lint scanned 12 requests with zero errors/warnings (exit 0). The generated collection files used for that check have since been removed at the owner's request.
- The 12-request collection ran against the built JAR on a temporary loopback HTTP port and the same disposable database, using three synthetic accounts with unusable password-hash fixtures and ephemeral JWT signing material. All 30 assertions passed (exit 0). `--no-report-events --silent` disabled result uploads and console payload output; raw credentials/link tokens were not persisted or logged by the runner scripts. The temporary HTTP process was stopped after the run.
- `git diff --check` passed. V1-V3 are unchanged. No frontend files were changed, and no commit/push was performed.
- No check against a deployed/shared environment or migration of development data was performed. Browser QR rendering is outside backend scope; the server returns only the capability and expiry for that future UI.

Changed files (paths relative to Backend):

- `src/main/java/com/smartlims/auth/security/SecurityConfiguration.java`: new route role rules only.
- `src/main/java/com/smartlims/patients/controller/PatientController.java`, `service/PatientService.java`: four new operations, thin transport and transactional workflows.
- `src/main/java/com/smartlims/patients/entity/Patient.java`, `repository/PatientRepository.java`: guarded linking and profile/account lookups/locks.
- `src/main/java/com/smartlims/patients/entity/PatientLinkToken.java`, `repository/PatientLinkTokenRepository.java`: dedicated token persistence and revocation/locking.
- `src/main/java/com/smartlims/patients/dto/LinkPatientRequest.java`, `dto/PatientLinkTokenResponse.java`: strict request and one-time response; redacted string representations.
- `src/main/java/com/smartlims/patients/exception/PatientProfileException.java`, `exception/PatientErrorHandler.java`: phase-2 errors using the existing envelope.
- `src/main/resources/db/migration/V5__patient_link_tokens.sql`: additive token table, indexes, and constraints; originally tested under V4 before the main-branch collision was discovered, then renumbered with unchanged SQL under explicit user authorization.
- `src/test/java/com/smartlims/patients/PatientProfileLinkingTest.java`, `PatientLinkTokenTest.java`: phase-2 integration/concurrency/unit coverage.
- `src/test/java/com/smartlims/patients/PatientManagementTest.java`, `src/test/java/com/smartlims/auth/AuthenticationRegressionTest.java`: retain existing assertions; include token table in isolated cleanup and the canonical V1-V5 migration expectations.
- `docs/DATABASE_DESIGN.md`, `docs/PATIENTS_API.md`: schema/contract/examples/verification documentation.
- The generated Postman request/example files used during the original verification were subsequently removed at the owner's request. Requests are now managed separately; collection files must not be generated inside the project without an explicit request.

### 15.8. Main-branch migration compatibility audit (2026-10-26)

**Historical audit:** source preparation as V5 was subsequently authorized and completed (section 15.9), followed by the recorded operator reconciliation described in DATABASE_DESIGN section 1.1. The observations and approval boundary below describe the earlier audit, before those later events; they do not mean reconciliation is still pending for that recorded database state.

- Current branch: backend-hmood at 92f123cb45acb223bedf1aa792d39a0809b8d400. The local main ref was stale at that same commit. Fetching origin/main revealed 9cb1fe7, which includes V4__lab_tests.sql. No branch was switched or merged.
- V1__auth_foundation.sql, V2__password_reset_attempts.sql, and V3__patients.sql are identical across the current branch and refreshed origin/main. The combined history has two different V4 scripts; V5 is the next available version.
- A read-only query against the configured development connection smart_lims_db@localhost found a successful history row: version 4, script V4__patient_link_tokens.sql, checksum 504398204. Therefore the linking migration has been applied outside the earlier disposable test database. Other team/deployed databases have not been inventoried.
- A separate read-only metadata check confirmed patient_link_tokens exists and lab_tests does not exist in that development database.
- The repository's original V4__patient_link_tokens.sql remains intact. Simply changing its filename to V5 would leave development with an incompatible V4 history and an already-existing token table. Keeping both V4 files in active Flyway locations fails duplicate-version validation.

Candidate combined filenames at audit time (now adopted in this checkout under subsequent user authorization):

1. V1__auth_foundation.sql
2. V2__password_reset_attempts.sql
3. V3__patients.sql
4. V4__lab_tests.sql (byte-identical to origin/main; Git blob 5e98ff3dfc4d4e3912442bf8fa2a48016c9f548a)
5. V5__patient_link_tokens.sql (unchanged SQL copied from the current linking migration)

Compatibility verification used a newly initialized disposable PostgreSQL 16.15 cluster bound only to loopback. The candidate project copy changed the migration-history test's expected versions to 1-5 and added three temporary migration checks, each using its own newly created disposable database. No development schema/data/history was modified and no existing database was reset to resolve the collision.

- Full candidate `.\mvnw.cmd verify '-Dspring.test.mockmvc.print=NONE'` passed 91 tests with zero failures, errors, or skips: all 88 application tests (including 21 authentication regressions) plus three compatibility checks. The executable JAR built successfully; Flyway and Hibernate validation passed against the five-migration set.
- The compatibility checks proved clean V1-V5 migration, upgrade from main's V1-V4 schema to V5 while retaining synthetic catalog/patient rows, and rejection of the original two-V4 set.
- A subsequent targeted run passed all four migration checks (zero failures/errors/skips), adding a disposable-only legacy recovery simulation: apply the original V4 linking history, insert synthetic patient/token rows, reclassify exactly the audited V4 record to V5, apply the missing V4 lab SQL out of order, and validate. The linking checksum and patient/token rows were preserved. This recovery procedure was NOT run against development.
- The first temporary harness used multiple schemas and allowed cross-schema FK references, which interfered with fixture cleanup. It was corrected to use separate fresh databases; the corrected run above passed. No repository tests were weakened or bypassed.
- These results establish the candidate schema/upgrade compatibility, not reconciliation of the development database's existing V4 identity. The earlier Postman run remains historical evidence for the original migration set; it was not rerun against this candidate.

Original approval boundary and proposed reconciliation (historical: source renumbering and later operator recovery are now recorded separately; this excerpt grants no new database-write authorization):

1. Inventory every affected environment and take a verified backup before any history change. Stop application writers during the reconciliation window.
2. Agree on main's existing V4__lab_tests.sql and the proposed V5__patient_link_tokens.sql as canonical identities. Adopting V5 for linking would require an explicit exception to the instruction not to rename an already-applied migration; its SQL contents/checksum would remain unchanged.
3. For a development database with exactly the audited V4 linking history, a controlled, guarded history reclassification from V4 linking to V5 linking would also require explicit authorization. Then apply main's previously unexecuted V4 lab migration in a one-time out-of-order run and validate the complete set. A generic Flyway repair alone must not relabel the linking SQL as executed lab SQL.
4. Databases already using main's V4 lab history can migrate normally to V5; unknown or divergent histories need their own reviewed plan. Do not delete schema history, reset databases, disable validation, or edit applied SQL to hide the mismatch.

At audit time no source migration renumbering, history repair, database reset, commit, push, or deployment was performed. Source renumbering is now complete; development history has still not been modified. Follow the reviewed runbook linked below rather than executing this historical excerpt.

For review only, the simulated history reclassification used the following predicate. It must run within a backed-up maintenance procedure with a history-table lock, confirmed schema state, and an assertion that exactly one row changed. No changes to checksum, SQL content, installed_rank, installed_on, or business records are required:

```sql
UPDATE flyway_schema_history
SET version = '5', script = 'V5__patient_link_tokens.sql'
WHERE version = '4'
  AND script = 'V4__patient_link_tokens.sql'
  AND checksum = 504398204
  AND success
  AND NOT EXISTS (
      SELECT 1 FROM flyway_schema_history WHERE version = '5'
  );
```

### 15.9. Authorized V5 preparation and combined verification (2026-10-26)

After main was merged at 9cb1fe7 and the security conflict was resolved, the user explicitly authorized preparing linking as V5 while prohibiting changes to smart_lims_db/history, staged Postman removals, .gitignore, commits, and pushes.

The final source/JAR migration set is V1__auth_foundation.sql, V2__password_reset_attempts.sql, V3__patients.sql, V4__lab_tests.sql, and V5__patient_link_tokens.sql. The old V4 linking filename is absent. V4 lab SQL is unchanged; linking SQL was moved byte-for-byte, retaining Flyway checksum 504398204 and SHA-256 8ADFE2373CECD7C12464F135E20A8D9A6B6EA416334F3DF47A90DA483A0B9831.

Changes for this preparation:

- Renumber linking to V5; assert versions 1-5 and exact V4/V5 script identities in PatientManagementTest.
- Include patient_link_tokens in LabTestManagementTest's isolated cleanup, because its retained foreign keys reference the same users/patients fixtures.
- Add the JDBC CHAR annotation to LabTest.currency. Combined Hibernate validation exposed a Java VARCHAR expectation against main's existing CHAR(3) column; this mapping-only correction preserves V4 SQL and the API.
- Add PatientMigrationCompatibilityTest and the guarded SQL fixture [src/test/resources/db/fixtures/reconcile-patient-linking-v4-to-v5.sql](../src/test/resources/db/fixtures/reconcile-patient-linking-v4-to-v5.sql). Compatibility tests load it from the test classpath; it is outside Flyway migration locations and never runs automatically at application startup.
- Add [the exact backup and reconciliation runbook](PATIENT_LINKING_V5_RECONCILIATION.md). It requires stopping writers, a verified backup/restore rehearsal, explicit approval for database writes, guarded single-row history reclassification, a one-time out-of-order V4 lab migration, and normal-order validation.

Actual checks:

- `.\mvnw.cmd clean '-Dtest=PatientMigrationCompatibilityTest' test`: six tests passed. Fresh databases, main-V4 upgrade with retained data, legacy recovery preserving data/original metadata, and refusal of checksum mismatch/wrong database/connected clients are covered. Each case creates and removes its own database on the explicitly isolated test server.
- `.\mvnw.cmd verify '-Dspring.test.mockmvc.print=NONE'`: 116 tests passed, zero failures/errors/skips, including all 21 authentication regression cases, the merged lab suite, patient suites, and the six migration checks. The executable JAR built successfully. Flyway and Hibernate validation passed.
- The first incremental run detected an obsolete V4 linking resource in generated output. Maven clean removed it; the final JAR was inspected and contains exactly the five canonical migrations. No generated output was edited manually.
- The first full merged validation exposed the lab currency mapping mismatch described above; after the annotation correction, the full suite passed.
- The built JAR's non-web startup/normal validation command exited 0 on the isolated database, with all five migrations validated and no pending migrations. Runtime JWT key material was generated for that process only.
- Only a newly initialized, confirmed empty PostgreSQL 16.15 cluster bound to loopback was used. No connection to smart_lims_db was made during this V5 preparation. Its backup/reconciliation commands are provided for manual execution only.
- Postman artifacts/removals and .gitignore were not edited. No Git staging, commit, push, branch switch, or deployment was performed. The earlier Postman run is historical evidence; no new Postman run was needed for this migration-only preparation.
- Final preservation checks matched the complete Git index snapshot (including staged removals), both root/Backend .gitignore hashes, and the original V4/linking SQL hashes. All six PowerShell runbook blocks parsed successfully; git diff --check passed. The disposable PostgreSQL cluster was stopped and removed. No development backup or reconciliation command was executed.

## 16. Patient My Profile

Status: DONE, 2026-10-30. Focused 78/78 and final full 367/367 tests pass;
see TESTING.md. Manual live client/deployment checks and owner commit are separate.

Tasks 33-36, MP-PAT-R01-R06. Screenshot: ui-references/patient-profile.jpeg.
Additive backend support; no frontend, Dashboard, Notifications or PDF changes.
Original GET/POST /me, POST /me/link, staff routes and nine-field PatientResponse
are unchanged. This section supersedes the earlier exclusion of self-updates only
for the explicit self-only /me/profile route. No schema migration is required.

### 16.1 View and edit

| Method/path | Behavior |
|---|---|
| GET /api/patients/me/profile | Own persisted patient demographics plus account email and calculated completion. |
| PUT /api/patients/me/profile | Full replacement of editable demographics using existing UpdatePatientRequest; returns the same My Profile view. |

Both require an authenticated, currently eligible stored-role PATIENT. Identity
comes exclusively from authentication -> users.id -> patients.user_id. No path or
query patient/account selector. All query parameters, including repeated ones,
are rejected with 400 VALIDATION_ERROR and the supplied query key in fieldErrors.
Staff receive 403; missing/ineligible authentication 401, subject to the existing
CSRF-filter precedence described in section 4. Bearer/cookie, CSRF and CORS policy
are unchanged. Success and errors carry Cache-Control: no-store; errors retain
the existing {code,message,fieldErrors,requestId} envelope and X-Request-Id.

No linked profile: **404 PATIENT_PROFILE_NOT_LINKED** for either operation. GET
does not create a profile, return account demographics as patient data, report a
fictitious 0% profile or identify matching walk-in records. An unlinked walk-in
with identical name/phone remains inaccessible. Reuse POST /api/patients/me to
explicitly create, or the existing staff-issued token and POST /me/link to claim
an existing record. Registration alone creates an account, not a patient profile.

PUT JSON (synthetic example):

```json
{
  "fullName":"Synthetic Patient Updated",
  "dateOfBirth":"2000-06-19",
  "gender":"UNKNOWN",
  "phoneNumber":"000001",
  "address":null
}
```

Editable fields belong to **patients**, not users. Reuse existing strict string
deserializers, trimming before validation and uppercase MALE/FEMALE/UNKNOWN enum.
fullName is nonblank <=120; phoneNumber nonblank <=20, not unique and without a
new invented phone-format rule. dateOfBirth is a real YYYY-MM-DD string, required
and not in the future using Asia/Jerusalem today. Address is optional <=500;
omitted/null/blank clears it to null. All other four fields are required on PUT.
Wrong JSON types/coercion, invalid date/enum, unknown fields: 400 INVALID_JSON.
Missing/null/blank/overlong required values or future birth date: 400
VALIDATION_ERROR. Invalid requests leave all patient/account fields unchanged.

**Read-only:** id, patientNumber, createdAt, updatedAt, email, emailEditable,
completionPercentage and missingFields. Ownership/account IDs, role, security,
verification, password and token fields are never accepted. Email is the current
authenticated user's canonical users.email, with emailEditable=false. No secure
self-email-change flow exists: even administrative account updates explicitly
reject changing email. This endpoint does not send email, change login identity,
verification state, account name/phone or account timestamps. Account/profile
fullName and phoneNumber remain independent by the approved existing policy.

Response (GET and PUT, 200):

```json
{
  "id":"11111111-1111-4111-8111-111111111111",
  "patientNumber":"PAT-000001",
  "fullName":"Synthetic Patient Updated",
  "dateOfBirth":"2000-06-19",
  "gender":"UNKNOWN",
  "phoneNumber":"000001",
  "address":null,
  "createdAt":"2026-10-30T10:00:00Z",
  "updatedAt":"2026-10-30T11:00:00Z",
  "email":"patient@example.invalid",
  "emailEditable":false,
  "completionPercentage":100,
  "missingFields":[]
}
```

### 16.2 Completion and transaction rules

No pre-existing completion policy was found. Compute the score at read/response
time from five equally weighted fields, **20 points each**, in this fixed order:
fullName, dateOfBirth, gender, phoneNumber, email. Name/phone/email must be nonblank;
date must be nonnull/nonfuture in Asia/Jerusalem; gender must be a stored enum.
UNKNOWN is an accepted explicit gender value and **counts as complete**. Do not
require a patient to invent a different gender or infer clinical matching.
missingFields lists absent/invalid fields in that order using the exact API names.
Address is optional, contributes no points and is never listed as missing.

Valid linked profiles normally score 100: existing profile creation requires all
four demographics and account access requires a verified email. This is required
field completion, not identity verification, clinical accuracy or care readiness.
An absent profile produces the explicit 404 above, not a fabricated score.

GET uses a repeatable-read transaction for a consistent account/profile projection.
PUT locks the eligible account first, then the profile selected by its user_id,
reusing the existing account -> profile ordering for creation/claim. Staff PUT
locks the same profile. Concurrent full replacements serialize; the last accepted
replacement wins as in existing staff PUT, never a field-wise merge. No optimistic
version/precondition is introduced. Identical PUT is safe to retry, creates no
record/link/security side effect and advances updatedAt as existing staff PUT does.
On uncertain response GET the current profile; PUT needs no Idempotency-Key.
No pagination applies to a single profile.

Patient ID/number/creator/link/creation time remain unchanged. Current demographics
can change future drafts/approvals under the existing workflow; already published
patient/result/specimen/reviewer snapshots remain immutable. No clinical history
rewrite, account synchronization, unlink/reassignment or publication-policy change.

Verification and honest execution limits are recorded in TESTING.md under My
Profile verification and Tasks 33-36 of IMPLEMENTATION_PLAN.md. Manual examples
here were not executed as a live HTTP campaign.
