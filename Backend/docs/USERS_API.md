# Administrative users API

## Admin Users screenshot review — ADM-PEOPLE-01 (2026-11-10)

| Visible field/action | Existing API/source |
|---|---|
| Invite User | POST /api/users; existing ADMIN invitation lifecycle and email, no password input; acceptance remains separate |
| User name/email, avatar initials | GET /api/users/page fullName/email; initials are a client display of fullName |
| Name/email search, role/status selectors | GET /api/users/page search/role/status, combined before counting/pagination |
| Last 30 Days selector | Existing documented account creation filter: createdFrom inclusive, createdTo exclusive; one captured now minus 30 rolling 24-hour days through that same now, not last login |
| User/Role/Status/Last Login sort controls | sort=fullName/role/status/lastLoginAt,asc or desc; existing nulls-last and id ASC ties |
| Last Login | Nullable lastLoginAt, persisted only by successful bearer/cookie login; never fabricated for invited/never-login accounts |
| Showing count, rows/page, navigation | Page envelope totalElements/page/size/totalPages/first/last; legacy GET /api/users remains separate |

The date meaning is documented below and implemented/tested, so no unresolved
date decision or new preset endpoint is introduced. Closed actions menus and
selection checkboxes add no new operation; existing lifecycle/permissions remain.
Current verification belongs in TESTING.md. No new Users implementation gap has
been identified by source review.

Contract established 2026-11-06 for the ADMIN Users Management screen.
Login accounts are independent of patient profiles. No operation here creates,
merges, reassigns or deletes a patient profile. Closed screenshot menus do not
authorize additional operations. Existing GET /api/users remains an unpaginated
array of AccountResponse with its existing fields and username ordering.

## Authorization and transport

Every /api/users operation requires an authenticated, currently eligible persisted
ADMIN, enforced at HTTP and service boundaries. Missing/ineligible identity is
401 UNAUTHORIZED; insufficient authority/current role is 403 FORBIDDEN.
Cookie writes require the existing CSRF cookie/header flow; explicit Bearer
selection retains existing precedence and CSRF behavior. No JWT, login eligibility,
temporary lockout or last-administrator counting policy changes.

## Paginated screen listing

GET /api/users/page is additive. All query parameters are optional, single-valued;
unknown/duplicate/invalid parameters return 400 VALIDATION_ERROR with fieldErrors.

| Parameter | Contract |
|---|---|
| search | Trimmed case-insensitive literal substring in account fullName OR email; max 120 characters. SQL wildcard characters are literal. |
| role | ADMIN, PATIENT, RECEPTIONIST or LAB_TECHNICIAN |
| status | BLOCKED, INVITED, PENDING_VERIFICATION or ACTIVE |
| createdFrom | Inclusive account creation timestamp with explicit offset, e.g. 2026-10-07T12:00:00Z |
| createdTo | Exclusive creation timestamp with explicit offset; must be later than createdFrom when both supplied |
| page | Zero-based integer, default 0, maximum Integer.MAX_VALUE |
| size | Integer 1-100, default 20; size=7 supports the reference |
| sort | fullName,asc (default), fullName,desc, role,asc/desc, status,asc/desc or lastLoginAt,asc/desc |

Bounds normalize to UTC. Offsetless dates/times are rejected. Filters combine
with AND. “Last 30 Days” sends createdFrom=now minus 30 rolling 24-hour days and
createdTo=the same captured now; the server does not apply a hidden date default.
Name sorts case-insensitively; role/status sort lexically by their enum names.
Every order puts nulls last in either direction and adds id ASC as tie-breaker.
Out-of-range pages return empty content with accurate totals, including large offsets.

```json
{"content":[{"id":"00000000-0000-0000-0000-000000000001","fullName":"Example User","email":"user@example.invalid","role":"PATIENT","status":"ACTIVE","lastLoginAt":null}],"page":0,"size":7,"totalElements":1,"totalPages":1,"first":true,"last":true}
```

Status precedence is BLOCKED (!enabled), then INVITED (ADMIN_INVITATION or
FIRST_ADMIN_INVITATION origin with no invitationAcceptedAt), then
PENDING_VERIFICATION (no emailVerifiedAt), otherwise ACTIVE. Expired invitations
remain INVITED. Password reset/set-password tokens on accepted accounts do not
change their status. Temporary lockout is separate and not a status.
Existing origin/acceptance fields are sufficient; historical lifecycle data is
not reconstructed. lastLoginAt is nullable UTC and starts null for existing rows.
Only successful authentication through shared LoginService records it; failed,
blocked, locked or unverified attempts and ordinary authenticated requests do not.

## Individual operations

| Method/path | Input and response |
|---|---|
| GET /api/users/{id} | Existing AccountResponse, 200; missing 404 USER_NOT_FOUND |
| POST /api/users | fullName, email, userName, phoneNumber, role; existing required invitation fields, any existing role; 200 AccountResponse |
| PUT /api/users/{id} | fullName, email required; userName/phoneNumber may be omitted/null to retain existing values, including null; supplied values retain validation; 200 AccountResponse |
| PUT /api/users/{id}/role | {"role":"PATIENT"}; 200 AccountResponse |
| PATCH /api/users/{id}/block | 200 AccountResponse |
| PATCH /api/users/{id}/unblock | 200 AccountResponse |
| GET /api/users/{id}/isblocked | Existing boolean response |
| POST /api/users/{id}/set-password-email | Existing {"success":true}; enabled targets only |
| DELETE /api/users/{id} | Physical deletion only when eligible; 204 |

Canonical email changes remain 400 EMAIL_CHANGE_NOT_ALLOWED. Duplicate identities
retain 409 EMAIL_IN_USE/USERNAME_IN_USE. Same-role and already-blocked/unblocked
operations are no-ops. Self-block/deletion/demotion and removal of the last
enabled, email-confirmed ADMIN retain 400 LAST_ADMIN and shared transaction
advisory coordination. The existing count is not expanded to password/invitation
eligibility. Changing a PATIENT with a linked profile to another role returns
409 PATIENT_ACCOUNT_LINKED; same-role succeeds. Historical links are not altered.
Deletion with retained patient, clinical or audit references returns
409 USER_HAS_RETAINED_REFERENCES. No clinical/audit records cascade; existing
email-action token cascade remains. Authorization precedes target lookup.

Invitations retain 24-hour hashed, single-use, account/purpose-bound tokens;
reissue replaces previous tokens. Blocked reissue returns 403 ACCOUNT_BLOCKED.
POST /api/auth/set-password accepts {userId,token,newPassword} publicly with
token proof, confirms the account and sets its password. Invalid/expired/used or
blocked proof returns 400 INVALID_INVITATION; password reuse is 400 SAME_PASSWORD.
Mail failure returns 503 EMAIL_UNAVAILABLE and rolls back database changes.
Password setting, role changes and logout retain existing JWT non-revocation.

## Atomic selected-ID bulk operations

PATCH /api/users/bulk/block and PATCH /api/users/bulk/unblock accept
{"ids":["00000000-0000-0000-0000-000000000001"]}. Require 1-100 distinct,
non-null UUIDs; invalid input is 400 VALIDATION_ERROR (ids or its indexed element). There is no select-all,
query-based selection, bulk role change or bulk deletion. Response is 200 with
an array of existing AccountResponse values in request order.

One transaction acquires the same administrator coordination lock, reloads caller
eligibility, locks targets in stable UUID order, and validates every target and
all administrator safeguards before any change. Missing target is 404
USER_NOT_FOUND; any failure rolls back the whole batch. Already-in-state targets
are no-ops, making repeated requests safe. Concurrent individual/bulk account
mutations share coordination. No email is sent by block/unblock.

## Persistence and verification

V26 adds only nullable users.last_login_at (TIMESTAMPTZ), without backfill.
All earlier migrations, historical links, last-admin counting, existing array
and authentication response shapes are preserved. Verification results are
recorded in TESTING.md; source implementation alone is not deployment evidence.
