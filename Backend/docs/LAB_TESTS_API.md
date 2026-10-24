# Lab Tests API

Implemented catalog endpoints use `/api/lab-tests` and JSON. Test Parameters and Reference Ranges are separate modules. Schema names follow `DATABASE_DESIGN.md` (`active`, not `is_active`). Apply Flyway V4 on startup; existing migrations are unchanged.

All endpoints require an eligible authenticated account using the existing bearer token or access cookie. Cookie writes also require the existing CSRF token. ADMIN, RECEPTIONIST, LAB_TECHNICIAN, and PATIENT can read the catalog, including inactive entries. Only ADMIN can write. No delete endpoint exists: deactivate records to retain their identity for historical references.

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
  "preparationInstructions": "Follow the laboratory's instructions"
}
```

`code`, `name`, `price`, and `sampleType` are required. Strings are trimmed. Code is normalized to uppercase and must match `[A-Z0-9][A-Z0-9_-]{0,29}`; uniqueness includes inactive tests. Name has a 150-character limit; sampleType has a 40-character limit. Optional description and preparationInstructions have 10,000-character limits and blank values become null. PUT clears omitted optional text. Currency defaults to ILS when omitted or null; any supplied non-ILS currency is rejected.

Price must be a JSON number from 0 through 9999999999.99, with at most two fractional digits. Strings, booleans, negative prices, excessive precision, and non-finite values are rejected. Text fields require JSON strings. IDs, availability, and timestamps are server-managed on create/replace; use the status endpoint to change availability.

The status request is `{"active":false}` or `{"active":true}`. The field is required and accepts only a JSON boolean. Repeating a status request is safe. Catalog writes are transactional; updates to a single test are serialized using a database row lock. Code uniqueness is also enforced by a database constraint, including concurrent requests. Current price updates affect only the catalog row; future order code must snapshot its name and price at order creation.

## Responses and queries

Create, detail, replace, and status return `id`, `code`, `name`, `description`, `price`, `currency`, `sampleType`, `preparationInstructions`, `active`, `createdAt`, and `updatedAt`. IDs are UUIDs and timestamps are UTC ISO instants. Internal JPA entities are never returned.

List accepts these optional parameters, each at most once:

| Parameter | Default | Validation |
|---|---|---|
| search | empty | Trimmed, up to 150 characters; case-insensitive literal substring of code or name |
| active | omitted | `true` or `false`; omitted includes both states |
| page | 0 | Nonnegative integer, zero-based |
| size | 20 | Integer from 1 through 100 |
| sort | `name,asc` | code, name, price, createdAt, or updatedAt followed by `,asc` or `,desc` |

Sorting adds UUID as a stable tie-breaker. Search treats `%`, `_`, and backslash literally. List returns `content`, `page`, `size`, `totalElements`, `totalPages`, `first`, and `last`. Distant pages beyond the result set return empty content.

## Errors

Errors follow the existing `{code,message,fieldErrors,requestId}` format, with `X-Request-Id` and `Cache-Control: no-store`. `fieldErrors` maps field names to messages and is empty when no field applies. No SQL or exception details are exposed. Configured exact CORS origins can read `Location` and `X-Request-Id`; unconfigured origins remain denied.

| Status | Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid fields, UUID, filter, sort, or pagination |
| 400 | INVALID_JSON | Malformed body or incorrect JSON scalar type |
| 401 | UNAUTHORIZED | Missing or invalid authentication |
| 403 | FORBIDDEN | Wrong role or invalid/missing cookie CSRF protection |
| 404 | LAB_TEST_NOT_FOUND | Valid UUID with no catalog test |
| 405 | Framework response | Unsupported method when the request reaches MVC; the security filter can reject unconfigured methods with 403 first |
| 409 | LAB_TEST_CODE_IN_USE | Normalized code already exists |
| 415 | Framework response or INVALID_REQUEST | Unsupported Content-Type on POST, PUT, or PATCH after authentication and CSRF checks |
| 500 | INTERNAL_SERVER_ERROR | Unexpected failure |

405 and 415 can be resolved before a controller is selected, so their framework response body is not guaranteed to use the catalog error envelope. Existing security takes precedence: for example, authenticated DELETE is denied with 403, since no delete endpoint is authorized.

## Verification

Run `./mvnw -Dtest=LabTestRequestTest,LabTestServiceTest,LabTestErrorHandlerTest,BrowserSecurityTest test` from Backend for database-free verification. Unit tests cover normalization, validation, strict JSON types, query limits, service authorization, status preservation, and concurrent-constraint error translation. `LabTestManagementTest` additionally covers real PostgreSQL persistence, HTTP security, literal searching, pagination, and concurrent creation. Like the existing integration suites it runs only when `SMARTLIMS_TEST_DATABASE_URL` points to `jdbc:postgresql://127.0.0.1:<port>/smartlims_auth_regression`, using user postgres and an empty password. Use only a dedicated disposable database: integration fixtures truncate its application tables.

The integration suite also checks database defaults and constraints, persisted timestamps for identical PUT/status writes, duplicate codes on create/update, and cookie authentication with missing, mismatched, and valid CSRF tokens for every write and role. Before running it, independently confirm that the configured PostgreSQL instance/database is isolated and disposable; the URL pattern alone does not establish isolation. Never point it at a development or shared database.
