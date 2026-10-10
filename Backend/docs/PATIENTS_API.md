# Smart-LIMS Patients API Contract

Status: implemented patient management phase 1; PostgreSQL-backed patient checks verified on 2026-10-08.
Date: 2026-10-08.
Repository location: `Backend/docs/PATIENTS_API.md`.
Database reference: `Backend/docs/DATABASE_DESIGN.md`.

## 1. Purpose and phase boundary

A user account authenticates a person and assigns their role. A patient profile is the laboratory record to which future orders and results will belong.

Existing patient registration creates a `users` account with role PATIENT. This phase does not change registration/login or automatically create/link a patient profile.

Phase 1 supports staff-created, unlinked patient profiles, staff search, profile retrieval, and staff updates. It also defines ownership-protected retrieval for an account that already has a legitimate profile link.

Out of scope:

- Patient self-profile creation or completion.
- Linking an existing walk-in profile to an account.
- Automatically matching profiles by name or phone.
- Profile deletion, merging, orders, bookings, results, or payment operations.
- Changes to authentication, JWT, cookies, CORS, or CSRF behavior.

Do not add placeholder public linking endpoints. A PATIENT with no linked profile cannot use phase-1 endpoints to create one.

## 2. Database model and relationships

| Column | Type | Nullable | Constraint / responsibility |
|---|---|---|---|
| id | UUID | No | Primary key; server generated |
| patient_number | VARCHAR(30) | No | Unique; server generated from a PostgreSQL sequence |
| user_id | UUID | Yes | Unique FK to users.id; NULL on phase-1 creation |
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
- `patients.created_by -> users.id`: many profiles may be created by the same staff account. This is not the patient's login account.
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

409 is not a normal duplicate-demographics error in phase 1. Patient numbers are server generated; phone/name/birth date are not unique. Repeated create requests may create separate records because POST has no idempotency key in this phase. Do not silently deduplicate them.

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
10. PATIENT may not list/create/update; a controlled test fixture linked to that account is readable, while another profile returns 404. Do not add a production linking endpoint for the test.
11. Anonymous GET calls fail with 401; anonymous writes fail with 401 after valid CSRF transport, or 403 when CSRF validation fails first. If testing cookies, follow the existing CSRF flow and test its protection.
12. Re-run relevant authentication tests to ensure existing behavior remains unchanged.

## 13. Implemented details and verification

- `V3__patients.sql` adds `patient_number_seq` and `patients`. V1 and V2 are unchanged. Unique patient numbers/account links, gender checks, nonblank name/phone checks, and non-cascading user foreign keys are enforced. FK and default-list-order indexes are included.
- The layer refactor leaves all three migrations, the schema, and the sequence unchanged.
- The module is under `com.smartlims.patients`: `controller` handles HTTP transport; `dto` owns request normalization/validation and response records; `service` owns application operations, role/ownership checks, field assignments, and transactions; `entity` holds persistence mappings, constructors, getters, and the required setters; `repository` handles persistence; `mapper.PatientMapper` converts entities/pages to responses; `exception` contains patient exceptions and `PatientErrorHandler`; `specification.PatientSpecifications` supplies reusable literal search predicates.
- New profiles always have `user_id = NULL`; `created_by` is the current authenticated staff account. No API or entity mutator links an account in this phase. A future linking workflow must verify the target account's PATIENT role. Controlled integration fixtures use PATIENT accounts for existing links.
- UUIDs follow the existing JPA generation strategy. Sequence numbers are formatted as `PAT-%06d` using a minimum width, and are allocated independently of transaction rollback. Timestamps are persisted before building write responses; successful PUT requests update `updated_at`, including unchanged payloads.
- `PatientService` creates the entity using its patient-number/creator constructor and assigns demographic/contact fields through setters. It explicitly sets `updated_at` before flushing PUT updates so identical payloads still persist a new timestamp. There are no generated-ID, created-at, account-link, patient-number, or creator setters.
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
