# Backend permissions audit

Audit date: 2026-10-31. Scope: the current working copy on `backend-hmood`, including existing modified files and untracked notifications implementation. This is a source audit, not an audit of a deployed server or its configuration. Existing work was preserved.

There are **91 distinct implemented application endpoints across 13 controllers**. Nine are public authentication actions; 82 require authentication. Public does not mean exempt from CSRF or from proof such as a password, invitation token or reset code. [ENDPOINT_PERMISSIONS.md](ENDPOINT_PERMISSIONS.md) lists every explicit HTTP method/full-path mapping exactly once, with controller and service line references, feature counts and prerequisites.

| Feature | Endpoint count |
|---|---:|
| Authentication | 10 |
| Account administration | 10 |
| Patients and profile linking | 10 |
| Patient dashboard | 1 |
| Laboratory catalog and parameters | 8 |
| Orders | 5 |
| Appointments and schedule, including no-show | 14 |
| Visits and patient visit archive | 9 |
| Samples and suitability attestations | 6 |
| Results, publication, patient reports and trends | 14 |
| Patient notifications | 4 |
| **Total** | **91** |

By explicit HTTP method: 42 GET, 36 POST, 9 PUT, 3 PATCH and 1 DELETE. Framework-generated HEAD/OPTIONS, CORS preflight and error dispatch are not separate implemented business endpoints.

## Evidence and limits

Read `AGENTS.md`, the current [implementation plan](../IMPLEMENTATION_PLAN.md), all application controllers, the complete security package, all endpoint-facing services and their authorization helpers, relevant DTOs/repository predicates, API contracts and permission-focused tests. Actual working-copy code takes precedence over documentation or historical test results. Line references describe this snapshot and may move after edits.

Verification on 2026-10-31 consisted of read-only source searches, an independent controller-mapping enumeration, report-to-source coverage/uniqueness checks, reference checks and a documentation diff review. No application startup, Maven tests/build, migrations, database access, Postman operations, credentials changes, commits or pushes were performed. Test cases cited below were inspected, not executed. Historical suite results in [TESTING.md](TESTING.md) and the plan are not current execution evidence or proof of deployment readiness. Runtime allowlist membership, CORS origins, TLS/cookie settings and deployed migration state remain unverified; no local secrets configuration was read.

## Roles and feature summary

The account has one stored role: [Role.java:3](../src/main/java/com/smartlims/auth/entity/Role.java#L3). There is no role hierarchy giving ADMIN all other roles. `ROLE_` authorities are created from the current database role, not the JWT's `Role` claim. [CurrentAccountAuthenticationConverter.java:22](../src/main/java/com/smartlims/auth/security/CurrentAccountAuthenticationConverter.java#L22)

- **PATIENT:** self-registration and linked-profile self-service; own orders, appointments, visits, published results, reports, history, trends, dashboard and notifications. Catalog reads are active-only. A patient account and a patient profile are separate records.
- **RECEPTIONIST:** patient administration/link-token issuance, staff order creation/cancellation, appointment scheduling/booking/actions and administrative visit operations. No account administration, clinical specimen access, result authoring, approval or publication.
- **LAB_TECHNICIAN:** patient/catalog/parameter and administrative visit reads; specimen work and clinical result reads; result draft creation/editing/corrections. No account administration, staff order creation/cancellation, booking/scheduling, arrival/completion/no-show, approval or publication.
- **ADMIN:** account administration, patient administration, catalog/parameter management, orders, appointments and administrative visits. Clinical sample operations and staff result reads require the separate administrator allowlist. Approval/publication also require that allowlist. ADMIN cannot author/edit/correct results or use PATIENT-only self-service routes.

In this matrix, “Own” means a link from the target patient profile to the authenticated account; “A*” means ADMIN additionally listed in `smartlims.laboratory.authorized-admin-ids`. Every protected cell also requires an eligible authenticated account. Public authentication actions remain available to every role and anonymous callers subject to their independent checks.

| Feature / capability | PATIENT | RECEPTIONIST | LAB_TECHNICIAN | ADMIN |
|---|---|---|---|---|
| Public registration/login/recovery/invitation/logout | Public transport rules | Same | Same | Same |
| Current account | Own account | Own account | Own account | Own account |
| Account list/create/update/roles/block/delete/invitation email | Denied | Denied | Denied | Allowed, account safeguards apply |
| Staff patient create/update/link-token issuance | Denied | Allowed | Denied | Allowed |
| Patient list / by-ID detail | No list; own detail | All | All | All |
| Self profile read/edit/create/claim | Own | Denied | Denied | Denied |
| Dashboard and notification inbox/read markers | Own | Denied | Denied | Denied |
| Catalog read | Active only | Active/inactive | Active/inactive | Active/inactive |
| Catalog and parameter writes | Denied | Denied | Denied | Allowed, no clinical allowlist needed |
| Parameter list | Denied | Allowed | Allowed | Allowed |
| Order create / cancel | Own | Any existing patient | Denied | Any existing patient |
| Order self list/detail | Own | Denied | Denied | Denied |
| Appointment types read / manage | Active read only | Read incl. inactive | Denied | Read/manage |
| Full schedule / slot management | Denied | Allowed | Denied | Allowed |
| Slot discovery, booking, alternatives, reschedule, cancel | Own order/appointment | Any patient | Denied | Any patient |
| Appointment self list/detail | Own | Denied | Denied | Denied |
| Arrival, visit completion, appointment no-show | Denied | Allowed | Denied | Allowed |
| Administrative visit list/detail | Denied | All | All | All, no clinical allowlist needed |
| Self visit reads / completed visit archive | Own | Denied | Denied | Denied |
| Specimen list/detail/create/receive/attest/reject | Denied | Denied | Allowed | A* only |
| Staff result queue/detail/version history | Denied | Denied | Allowed | A* only |
| Result draft create/edit/correction | Denied | Denied | Allowed, no creator-only restriction | Denied, including A* |
| Result approval | Denied | Denied | Denied | A*, independent of authorship/editing |
| Result publication | Denied | Denied | Denied | A*, approved content; see separation rule below |
| Patient result list/detail/PDF/history/trends | Own, publication visibility applies | Denied | Denied | Denied |
| Payment management / general audit query / notification administration | No implemented endpoint | No implemented endpoint | No implemented endpoint | No implemented endpoint |

## Request security and authentication

The sole application [SecurityFilterChain](../src/main/java/com/smartlims/auth/security/SecurityConfiguration.java#L35) disables Basic authentication, form login and built-in logout, uses stateless sessions, configures CORS/CSRF and Spring OAuth2 resource-server JWT authentication, then applies ordered method/path rules. Unmatched requests are denied by default at [SecurityConfiguration.java:128](../src/main/java/com/smartlims/auth/security/SecurityConfiguration.java#L128). Account paths use a broad ADMIN matcher; most other features use explicit method/path matchers. There are no `@PreAuthorize`, `@PostAuthorize`, `@Secured`, `@RolesAllowed` or `@EnableMethodSecurity` declarations in application source, and no custom servlet authentication filter or interceptor. Authorization beyond the route chain is ordinary service/helper code, not method-security interception.

JWTs use HS256 with signature, issuer `smart-lims-api`, audience `smart-lims-client` and timestamp validation with zero clock skew. The configured token lifetime defaults to 60 minutes and must be 1–1440 minutes. Each protected request resolves the subject UUID, reloads the user and requires enabled, email verified, password present, and either public-registration origin or accepted invitation. Deleted, blocked or otherwise ineligible accounts produce 401. Changed roles affect existing unexpired JWTs immediately. Unblocking can restore an old JWT. [JwtKeyConfiguration.java:25](../src/main/java/com/smartlims/auth/security/JwtKeyConfiguration.java#L25), [LoginService.java:33](../src/main/java/com/smartlims/auth/service/LoginService.java#L33), [LoginEligibility.java:9](../src/main/java/com/smartlims/auth/security/LoginEligibility.java#L9)

On protected requests, any `Authorization` header selects header authentication exclusively. A non-Bearer header suppresses cookie fallback; a malformed/invalid/expired Bearer token never falls back to a valid cookie. Without that header, `access_token` supplies the JWT. Query/form access tokens are disabled. The nine explicit public authentication actions ignore access credentials, including expired tokens and blocked/deleted accounts; their passwords/action tokens/CSRF checks still apply. [RequestTokenResolver.java:12](../src/main/java/com/smartlims/auth/security/RequestTokenResolver.java#L12)

Login checks blocked/temporary-lock state before password verification. Invalid credentials normally return 400 `INVALID_CREDENTIALS`; blocked/locked accounts return 403 `ACCOUNT_BLOCKED` / `ACCOUNT_LOCKED`; a correct password for an account failing eligibility returns 400 `EMAIL_NOT_CONFIRMED`. Five failed logins trigger a one-minute lock. **This temporary lock is a login restriction:** `LoginEligibility` does not consult `lockedUntil`, so it does not invalidate existing JWTs. Logout clears cookies; logout, password reset and invitation password changes do not revoke issued JWTs. No refresh-token, token-version or logout-all mechanism exists. These are documented design choices, not inferred revocation guarantees. [LoginService.java:61](../src/main/java/com/smartlims/auth/service/LoginService.java#L61), [UserAccount.java:128](../src/main/java/com/smartlims/auth/entity/UserAccount.java#L128), [UserAccount.java:153](../src/main/java/com/smartlims/auth/entity/UserAccount.java#L153), [AuthController.java:86](../src/main/java/com/smartlims/auth/controller/AuthController.java#L86), [AUTH_REQUIREMENTS.md](../AUTH_REQUIREMENTS.md)

## Cookies, CSRF and CORS

`access_token` is HttpOnly, Path=/, Secure by default and SameSite=None when secure. The readable `XSRF-TOKEN` cookie uses Path=/ and the same Secure/SameSite policy. Insecure cookies are permitted only with the `local` profile and use SameSite=Lax. Access-cookie lifetime follows the JWT duration. [AccessCookieFactory.java:13](../src/main/java/com/smartlims/auth/security/AccessCookieFactory.java#L13), [SecurityConfiguration.java:133](../src/main/java/com/smartlims/auth/security/SecurityConfiguration.java#L133)

Obtain a CSRF cookie from the public CSRF-token action; send its raw value as `X-XSRF-TOKEN` with cookies on unsafe requests. Cookie-login always requires CSRF, even with a Bearer header, and rotates the CSRF token on success. Refresh the client token after login; logout clears both cookies. CSRF handling accepts raw header values and retains XOR handling for server-rendered token attributes. [AuthController.java:42](../src/main/java/com/smartlims/auth/controller/AuthController.java#L42), [AuthController.java:70](../src/main/java/com/smartlims/auth/controller/AuthController.java#L70), [SpaCsrfTokenRequestHandler.java:21](../src/main/java/com/smartlims/auth/security/SpaCsrfTokenRequestHandler.java#L21)

The actual [CSRF matcher](../src/main/java/com/smartlims/auth/security/RequestTokenResolver.java#L50) is transport-dependent:

| Request situation | CSRF required? |
|---|---|
| GET, HEAD, OPTIONS, TRACE | No CSRF; this does not itself authorize the method/path |
| Cookie-login unsafe request | Always |
| Other unsafe request with syntactically recognized explicit Bearer header | No; protected handlers still require a valid JWT |
| Unsafe request with malformed or non-Bearer Authorization header | Yes; cookie fallback remains suppressed |
| Logout without explicit Bearer selection | Yes, even without an access cookie |
| Other public unsafe action without Authorization header or access cookie | No |
| Other public unsafe action carrying an access cookie | Yes, including a stale cookie |
| Other protected unsafe request without explicit Bearer selection | Yes, even if anonymous |

CSRF runs before authentication. Consequently an anonymous unsafe request can receive **403 `FORBIDDEN` before 401**. The same code covers wrong role, clinical allowlist failure and invalid CSRF; response code alone does not identify which check denied access. Public actions remain public even if a syntactically valid but expired Bearer header selects CSRF exemption, because access JWT authentication is intentionally skipped on those actions.

CORS permits only exact configured HTTP(S) origins, credentials, GET/POST/PUT/PATCH/DELETE/OPTIONS, headers `Content-Type`, `X-XSRF-TOKEN`, `Authorization`, `Idempotency-Key`, and exposes `Location`/`X-Request-Id`. Empty origin configuration grants no cross-origin access; wildcards/invalid origins fail configuration. CORS neither grants roles nor replaces CSRF. Cross-host browser access also requires a way for the frontend to read the API's host-only CSRF cookie. Rejected CORS requests are handled by the framework and need not use the JSON application error envelope. [SecurityConfiguration.java:145](../src/main/java/com/smartlims/auth/security/SecurityConfiguration.java#L145), [BrowserSecurityTest.java:11](../src/test/java/com/smartlims/auth/security/BrowserSecurityTest.java#L11)

## Patient identity, linking and ownership

Public registration always creates only a PATIENT user account, with no profile/link/JWT. Administrative fields in registration are rejected by strict JSON input. Staff account creation uses ADMIN invitation flows; the invitation API can create any of the four roles, including another ADMIN or PATIENT. Email verification and invitation tokens are purpose-bound, single-use, account-bound and normally expire after 24 hours. Recovery requires the existing eligible account and its four-digit reset code, valid for 15 minutes with five wrong attempts before invalidation. [RegistrationService.java:45](../src/main/java/com/smartlims/auth/service/RegistrationService.java#L45), [UserAccount.java:85](../src/main/java/com/smartlims/auth/entity/UserAccount.java#L85), [AccountManagementService.java:50](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L50), [PasswordRecoveryService.java:37](../src/main/java/com/smartlims/auth/service/PasswordRecoveryService.java#L37)

Staff profile creation leaves `patients.user_id` null. Only an eligible PATIENT may self-create a profile or claim an existing one. Self-creation fails if the account already has a profile. ADMIN/RECEPTIONIST issue a 10-minute opaque claim token for an unlinked profile; reissue revokes outstanding tokens. The PATIENT claim checks token syntax, hash, expiry, consumption/revocation and that neither account nor profile is already linked, under locks. The claim token is **not bound to a preselected recipient account**: an eligible unlinked PATIENT possessing it can claim the profile. Safe recipient handoff is outside the API; the code does not verify the claimant's demographics against the profile. No email/name/phone/patient-number matching, automatic merging, reassignment or unlink endpoint exists. [PatientService.java:86](../src/main/java/com/smartlims/patients/service/PatientService.java#L86), [PatientService.java:98](../src/main/java/com/smartlims/patients/service/PatientService.java#L98), [PatientService.java:111](../src/main/java/com/smartlims/patients/service/PatientService.java#L111)

Ownership follows `patients.user_id = authenticated account UUID`, through an order where applicable, never `created_by`. Thus staff-created orders and pre-link notifications become visible to the legitimate linked patient. Most collection/self aggregate routes explicitly return 404 `PATIENT_PROFILE_NOT_LINKED` without a link. Ordinary detail reads instead return the resource's concealed not-found error for foreign/missing/unlinked records. Archive detail explicitly checks the link first. Booking/availability and appointment actions check the target order's patient link for PATIENT callers; ADMIN/RECEPTIONIST may act across patients, including unlinked profiles. [OrderReadService.java:42](../src/main/java/com/smartlims/orders/service/OrderReadService.java#L42), [AppointmentAccess.java:26](../src/main/java/com/smartlims/appointments/service/AppointmentAccess.java#L26), [LaboratoryAccess.java:29](../src/main/java/com/smartlims/laboratory/service/LaboratoryAccess.java#L29)

Self profile editing changes demographics only. Account email is read-only (`emailEditable=false`); client-supplied identity/security/completion fields cannot redirect ownership. Account and profile names/phones are separate. Completion percentage is descriptive and does not gate orders/results. Staff profile reads are broad by role, with no assigned-patient or care-team constraint. [PatientService.java:70](../src/main/java/com/smartlims/patients/service/PatientService.java#L70), [PatientService.java:141](../src/main/java/com/smartlims/patients/service/PatientService.java#L141), [PatientMapper.java:17](../src/main/java/com/smartlims/patients/mapper/PatientMapper.java#L17)

## Account administration safeguards

All account-management HTTP routes require ADMIN. Updating a profile cannot change canonical email (400 `EMAIL_CHANGE_NOT_ALLOWED`); role changes use their own operation. The service prohibits self-blocking, self-deletion and **any self role change**, not just demotion. These all return 400 `LAST_ADMIN`, even when the reason is self-protection rather than the last-administrator count. A same-role request returns unchanged. Self-unblock is not prohibited by the service, but a blocked account cannot authenticate to do it itself. [AccountManagementService.java:120](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L120)

Blocking, role removal and deletion serialize administrator changes and protect the last enabled ADMIN with non-null email verification. The count does not additionally require password/invitation eligibility or absence of a temporary login lock. Invitation resend rejects a blocked target with 403 `ACCOUNT_BLOCKED`. Password setting rejects bad/expired/consumed/mismatched tokens or blocked targets with 400 `INVALID_INVITATION`; a nonexistent target yields 404 `USER_NOT_FOUND` before token checking. Password reuse returns 400 `SAME_PASSWORD`. [AccountManagementService.java:84](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L84), [AccountManagementService.java:142](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L142), [AccountManagementService.java:173](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L173)

First-administrator provisioning is a separate non-web command, refuses if any ADMIN exists (even blocked/unconfirmed) and sends an invitation. It is not a public endpoint or normal-startup bypass. Account deletion is an attempted physical delete; retained foreign keys can prevent deletion. The authentication advice does not define a domain error for retained-reference failures, so a stable deletion-conflict HTTP/body contract cannot be established from these handlers alone. [FirstAdministratorCommand.java:14](../src/main/java/com/smartlims/auth/provisioning/FirstAdministratorCommand.java#L14), [AccountManagementService.java:72](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L72), [AuthErrorHandler.java:17](../src/main/java/com/smartlims/auth/controller/AuthErrorHandler.java#L17), [V4__patients.sql:6](../src/main/resources/db/migration/V4__patients.sql#L6)

## Clinical permissions and publication visibility

`LaboratoryAccess.clinical` allows LAB_TECHNICIAN or allowlisted ADMIN; `reviewer` allows only allowlisted ADMIN. Default empty configuration grants no administrator clinical authority. Membership is parsed into an immutable set when the helper is constructed; there is no runtime HTTP permission-grant operation. Stored role and account eligibility are still rechecked. Catalog/parameter management and administrative visits do **not** require this allowlist. [LaboratoryAccess.java:18](../src/main/java/com/smartlims/laboratory/service/LaboratoryAccess.java#L18)

Only technicians author, edit and create corrections. There is no restriction to the original author, assigned technician or patient: any eligible technician may act on a valid target. Editing APPROVED content invalidates approval; PUBLISHED content cannot be edited. Approval additionally rejects anyone recorded as the version's original entrant or in CREATE/EDIT/CORRECTION events, including after a role change. **Publication does not repeat that author check and does not require the publisher to equal, or differ from, the approver.** Any eligible allowlisted ADMIN may publish an already approved version, including its approver. An author later promoted to allowlisted ADMIN is therefore barred from approving their version but is not separately barred from publishing it after independent approval. [ResultDraftService.java:33](../src/main/java/com/smartlims/results/service/ResultDraftService.java#L33), [ResultPublicationService.java:55](../src/main/java/com/smartlims/results/service/ResultPublicationService.java#L55), [ResultPublicationService.java:74](../src/main/java/com/smartlims/results/service/ResultPublicationService.java#L74)

Patient detail/PDF/history require ownership and PUBLISHED status; superseded published versions remain readable. Drafts and merely approved versions return the same 404 as foreign/missing results. Patient result lists show pending work items but no draft measurement content. Trends use only owned current published numeric values. Archive entries require own completed visits with current published results tied through actual specimens; ordinary self visit detail need not meet archive publication/completion criteria. Dashboard aggregates follow the same ownership/publication boundaries. [PatientResultReadService.java:20](../src/main/java/com/smartlims/results/service/PatientResultReadService.java#L20), [ResultListService.java:27](../src/main/java/com/smartlims/results/service/ResultListService.java#L27), [ResultValueRepository.java:12](../src/main/java/com/smartlims/results/repository/ResultValueRepository.java#L12), [VisitArchiveService.java:111](../src/main/java/com/smartlims/visits/service/VisitArchiveService.java#L111), [PatientDashboardService.java:56](../src/main/java/com/smartlims/patients/service/PatientDashboardService.java#L56)

Patient result mapping suppresses lifecycle events, but returns value-level `notes` and approved/publication actor IDs/names. The PDF renders those notes as “Approved notes”; trends return retained notes too. See the unresolved documentation wording in finding F4 below; do not promise that every field called notes is staff-only. [ResultMapping.java:16](../src/main/java/com/smartlims/results/service/ResultMapping.java#L16), [ResultResponse.java:12](../src/main/java/com/smartlims/results/dto/ResultResponse.java#L12), [ResultReportRenderer.java:108](../src/main/java/com/smartlims/results/report/ResultReportRenderer.java#L108), [HealthTrendService.java:114](../src/main/java/com/smartlims/results/service/HealthTrendService.java#L114)

Every notification list/count/read-marker query checks the current patient link, source order relationship, appointment relationship and result publication status. An inbox row alone does not authorize its target. A superseded PUBLISHED result notification remains visible. Notification writes only mark visible records read; there is no patient/staff API to create, delete, send or administer notifications. SYSTEM is a supported category without a producer. [PatientNotificationRepository.java:10](../src/main/java/com/smartlims/notifications/repository/PatientNotificationRepository.java#L10), [NotificationService.java:44](../src/main/java/com/smartlims/notifications/service/NotificationService.java#L44), [NOTIFICATIONS_API.md](NOTIFICATIONS_API.md)

## Authorization versus workflow prerequisites

Role, account eligibility, patient ownership, clinical allowlist and independent approval are authorization. These are distinct from input validity, status transitions, revisions, idempotency, capacity and clinical evidence. An authorized ADMIN does not bypass any workflow check.

| Authorized operation | Separate prerequisite / failure examples |
|---|---|
| Create order | Existing target/link, available active tests, UUID Idempotency-Key; 409 `ORDER_TEST_UNAVAILABLE` / `IDEMPOTENCY_KEY_REUSED` |
| Cancel order | PENDING for a new cancellation; staff reason required even on a repeat; 409 `ORDER_NOT_CANCELLABLE`, 400 `VALIDATION_ERROR` |
| Book/discover slots | PENDING order, no active booking; active type, future active slot, capacity and patient overlap rules; 409 `ORDER_NOT_BOOKABLE` / `APPOINTMENT_SLOT_UNAVAILABLE` |
| Move/cancel appointment | Future CONFIRMED appointment; moving also needs PENDING order, revision and available target; 409 `APPOINTMENT_NOT_CHANGEABLE` / `APPOINTMENT_CHANGED`. Cancellation is not made ADMIN-exempt |
| Arrival / visit completion / no-show | Valid order/item relationships, actual times, state and revisions; completion does not itself mean results are published |
| Sample receipt/attestation/rejection | Required state, revision, relationship and reason; approved/published evidence cannot be rejected: 409 `SAMPLE_IN_USE` |
| Approve/publish result | Current expectedVersion, required measurements, usable received specimens and explicit item attestation; 409 `RESULT_CHANGED`, `RESULT_INCOMPLETE`, `RESULT_SPECIMEN_UNAVAILABLE`, `RESULT_STATE_CONFLICT` |
| Create correction | Current publication, reason, key and no other working version; independent approval/publication lifecycle starts again |

Relationship integrity between an order item, visit and specimen is evidence validation, not patient ownership authorization for staff. An expectedVersion is concurrency control, not a permission token. Idempotent repetition still checks current role/eligibility/ownership, and does not grant a new privilege. See the endpoint inventory for operation-specific sources.

## Denial behavior and error contracts

Filter security and feature handlers generally use `{code,message,fieldErrors,requestId}`, matching `X-Request-Id` and `Cache-Control: no-store`. Filter-level 401/403 use “Authentication is required.” / “Access is denied.” and empty fieldErrors. [JsonSecurityErrorHandler.java:16](../src/main/java/com/smartlims/auth/security/JsonSecurityErrorHandler.java#L16)

| HTTP / code | Actual meaning |
|---|---|
| 401 `UNAUTHORIZED` | Protected request lacks acceptable JWT/current eligible account; feature helper can also reject missing/ineligible persisted account |
| 403 `FORBIDDEN` | Disallowed role, unlisted clinical ADMIN, author attempting approval, forbidden inactive discovery, or missing/invalid required CSRF |
| 404 `PATIENT_NOT_FOUND`, `ORDER_NOT_FOUND`, `APPOINTMENT_NOT_FOUND`, `VISIT_NOT_FOUND`, `RESULT_NOT_FOUND`, `NOTIFICATION_NOT_FOUND` | Missing resource; patient ownership/visibility concealment uses the same resource-specific code |
| 404 `PATIENT_PROFILE_NOT_LINKED` | Self aggregate/list/profile operation explicitly requires the account's patient link; not every detail route uses this code |
| 404 `LAB_TEST_NOT_FOUND` | Missing catalog item or inactive detail hidden from PATIENT |
| 404 `TREND_SERIES_NOT_FOUND` | Well-formed series key absent from the caller's visible current series |
| 400 `VALIDATION_ERROR` / `INVALID_JSON` | Invalid input, unsupported/identity fields, malformed UUID/revision/body/query; not authorization |
| 400 `LAST_ADMIN`, `EMAIL_CHANGE_NOT_ALLOWED` | Account safeguards described above; not generic 403 |
| 400 `INVALID_VERIFICATION_TOKEN`, `INVALID_INVITATION`, `INVALID_RESET_CODE`, `SAME_PASSWORD` | Failed proof/password condition in otherwise public actions |
| 400 `INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED`; 403 `ACCOUNT_BLOCKED`, `ACCOUNT_LOCKED` | Login-specific decisions; protected JWT failure normally uses 401 instead |
| 404 `USER_NOT_FOUND` | Missing administrative target or unknown/ineligible forgot-password account; set-password missing target also uses it |
| 409 feature-specific codes | Workflow/revision/retry/data conflicts; not permission denials |
| 503 `EMAIL_UNAVAILABLE` | Auth email infrastructure failure, not a role decision |

Sources: [PatientErrorHandler.java:19](../src/main/java/com/smartlims/patients/exception/PatientErrorHandler.java#L19), [PatientProfileException.java:15](../src/main/java/com/smartlims/patients/exception/PatientProfileException.java#L15), [OrderException.java:19](../src/main/java/com/smartlims/orders/exception/OrderException.java#L19), [AppointmentException.java:14](../src/main/java/com/smartlims/appointments/exception/AppointmentException.java#L14), [LaboratoryException.java:12](../src/main/java/com/smartlims/laboratory/exception/LaboratoryException.java#L12), [LaboratoryErrorHandler.java:20](../src/main/java/com/smartlims/laboratory/exception/LaboratoryErrorHandler.java#L20), [AuthErrorHandler.java:21](../src/main/java/com/smartlims/auth/controller/AuthErrorHandler.java#L21).

Filter checks precede MVC validation. Valid authentication with the wrong role normally gives 403 before body parsing; malformed bodies or query parsing can precede a service-level allowlist/ownership decision for an otherwise route-allowed role. UUID parsing sometimes precedes service ownership; a malformed ID can be 400 while a valid foreign ID is 404. Unconfigured methods/paths are denied before a handler, so do not universally promise 404/405. Framework 405/415 responses, CORS rejection and unhandled auth exceptions need not have the feature envelope. `JsonSecurityErrorHandler.badRequest` defines `INVALID_AUTH_TRANSPORT`, but no application caller was found: it is not an established live denial path.

## Findings, inconsistencies and uncertainty

No route-to-service role mismatch or missing patient ownership predicate was identified for the 91 implemented mappings in this static inspection. That finding is limited to inspected code; it is not a runtime security certification. The following gaps require separate decisions or work, not changes in this documentation task.

| ID / assessment | Concrete evidence and consequence | Follow-up / uncertainty |
|---|---|---|
| F1 — service authorization gap; HTTP boundary currently present | [AccountManagementService.java:50](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L50), [113](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L113), [142](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L142): administrative methods lack caller-role/eligibility checks. Actor UUIDs in role/block/delete enforce self-protection, not authority. [SecurityConfiguration.java:71](../src/main/java/com/smartlims/auth/security/SecurityConfiguration.java#L71) supplies ADMIN protection for HTTP; no method security exists. An internal caller can invoke privileged operations without an authenticated ADMIN | Preserve the non-web first-admin path while defining service entry-point authorization. This is a defense-in-depth/internal-call gap, not evidence of an anonymously reachable HTTP bypass |
| F2 — uneven persisted-account rechecks in services | [LabTestService.java:125](../src/main/java/com/smartlims/labtests/service/LabTestService.java#L125) and staff/basic patient CRUD at [PatientService.java:141](../src/main/java/com/smartlims/patients/service/PatientService.java#L141) trust Authentication authorities. Self-profile/linking, orders, appointments and laboratory helpers additionally reload role/eligibility. The JWT converter protects normal HTTP calls, but forged/stale internal Authentication objects are not equivalently rejected | Decide whether every service must enforce stored authorization independently. Tests covering HTTP current-role behavior do not establish this guarantee for all direct service methods |
| F3 — linked-account role lifecycle is unspecified/inconsistent with a stated invariant | [PATIENTS_API.md:55](PATIENTS_API.md#L55) says a linked account must be PATIENT. Linking enforces that initially, but [AccountManagementService.java:153](../src/main/java/com/smartlims/auth/service/AccountManagementService.java#L153) changes another account's role without checking patient linkage; [V4__patients.sql:6](../src/main/resources/db/migration/V4__patients.sql#L6) has uniqueness/FK but no role constraint. A link can remain after promotion | This does not grant staff the patient-only routes. Whether linked accounts may become staff, should retain their link, or must be rejected is unresolved. No dedicated linked-patient role-change acceptance test was located |
| F4 — patient notes wording conflicts with actual projections | [RESULTS_API.md:152](RESULTS_API.md#L152) says the patient projection never contains “draft history/internal events/notes”; actual [ResultMapping.java:19](../src/main/java/com/smartlims/results/service/ResultMapping.java#L19) passes value notes to patients, and [ResultReportRenderer.java:108](../src/main/java/com/smartlims/results/report/ResultReportRenderer.java#L108) prints them. [MEDICAL_HISTORY_API.md:135](MEDICAL_HISTORY_API.md#L135) explicitly returns notes; [HealthTrendTest.java:33](../src/test/java/com/smartlims/laboratory/HealthTrendTest.java#L33) expects a retained note | Clarify whether “internal notes” means a separate unimplemented field or these value notes. Confirmed documentation ambiguity/data-visibility discrepancy; an unintended clinical disclosure is not established without that decision. Lifecycle events are correctly suppressed |
| F5 — shareable authentication permissions contract incomplete; example drift | [AUTH_API.md:3](AUTH_API.md#L3) explicitly covers registration only, leaving login/recovery/invitation/users details in local-only AUTH_REQUIREMENTS. [PATIENTS_API.md:475](PATIENTS_API.md#L475) reads `pm.response.json().accessToken`, while [AuthController.java:112](../src/main/java/com/smartlims/auth/controller/AuthController.java#L112) returns `{token}`. Such examples can leave clients without a usable credential | Complete the shareable contract and correct stale example separately. No backend token field was changed here |
| F6 — approval/publisher separation has a narrower implementation than an informal “independent reviewer” label may imply | Approval checks original entrant and CREATE/EDIT/CORRECTION actors; [publish at line 75](../src/main/java/com/smartlims/results/service/ResultPublicationService.java#L75) checks reviewer grant and workflow but no author/approver identity relation. [ResultPublicationTest.java:17](../src/test/java/com/smartlims/laboratory/ResultPublicationTest.java#L17) allows the approver and another reviewer to publish; line 25 covers author approval after role change | Existing RESULTS_API explicitly allows the approver to publish, so that is not a defect. An author promoted to allowlisted ADMIN publishing after independent approval is a source-derived edge case without a dedicated test found. Any stronger publication separation requirement remains unresolved |

Other explicit boundaries: all eligible technicians have global clinical access, clinical ADMIN grants come from deployment configuration, and claim tokens are bearer proofs without recipient binding. No narrower assignment/recipient-verification policy exists in code; this audit does not invent one. Forgot-password 404 and login blocked/locked responses expose account-state distinctions, consistent with [AUTH_REQUIREMENTS.md](../AUTH_REQUIREMENTS.md); changing that tradeoff is outside scope. Deletion of retained accounts lacks a documented stable failure contract. Payments and general audit management have no implemented controllers, despite being in the broader project scope; laboratory lifecycle events are recorded internally without a general audit-query endpoint.

Stage-specific historical notes in ORDERS_API about no visits or processing transitions are superseded by its Stage 4 integration sections and current code; they must not be read as current permission grants or missing-feature evidence. The appointments contract's “LAB_TECHNICIAN has no appointment access” describes scheduling/actions: technicians can see appointment identifiers through permitted administrative visit/result projections. Notification contracts and the current dashboard agree on persisted unread counts.

## Inspected test evidence

These are source assertions only, not results of this audit's execution:

| Area | Relevant existing test source |
|---|---|
| Public stale credentials, cookies/CSRF, Bearer precedence, current role, blocking, non-revocation, last ADMIN | [AuthenticationRegressionTest.java:177](../src/test/java/com/smartlims/auth/AuthenticationRegressionTest.java#L177), [273](../src/test/java/com/smartlims/auth/AuthenticationRegressionTest.java#L273), [334](../src/test/java/com/smartlims/auth/AuthenticationRegressionTest.java#L334), [362](../src/test/java/com/smartlims/auth/AuthenticationRegressionTest.java#L362) |
| Patient role matrix, concealed foreign profile, linking and self-edit boundaries | [PatientManagementTest.java:157](../src/test/java/com/smartlims/patients/PatientManagementTest.java#L157), [PatientProfileLinkingTest.java:248](../src/test/java/com/smartlims/patients/PatientProfileLinkingTest.java#L248), [PatientSelfProfileTest.java:211](../src/test/java/com/smartlims/patients/PatientSelfProfileTest.java#L211) |
| Catalog active-only visibility and write restrictions | [LabTestManagementTest.java:140](../src/test/java/com/smartlims/labtests/LabTestManagementTest.java#L140), [481](../src/test/java/com/smartlims/labtests/LabTestManagementTest.java#L481), [577](../src/test/java/com/smartlims/labtests/LabTestManagementTest.java#L577) |
| Order roles, ownership, replays, cancellation | [OrderCreationTest.java:185](../src/test/java/com/smartlims/orders/OrderCreationTest.java#L185), [338](../src/test/java/com/smartlims/orders/OrderCreationTest.java#L338), [OrderReadTest.java:119](../src/test/java/com/smartlims/orders/OrderReadTest.java#L119), [OrderCancellationTest.java:99](../src/test/java/com/smartlims/orders/OrderCancellationTest.java#L99) |
| Appointment roles, active discovery, owned booking/detail, alternatives | [AppointmentScheduleTest.java:15](../src/test/java/com/smartlims/appointments/AppointmentScheduleTest.java#L15), [AppointmentBookingTest.java:24](../src/test/java/com/smartlims/appointments/AppointmentBookingTest.java#L24), [AppointmentReadTest.java:32](../src/test/java/com/smartlims/appointments/AppointmentReadTest.java#L32), [AppointmentRescheduleTest.java:18](../src/test/java/com/smartlims/appointments/AppointmentRescheduleTest.java#L18) |
| Allowlist, clinical roles and independent approval | [LaboratoryFoundationTest.java:30](../src/test/java/com/smartlims/laboratory/LaboratoryFoundationTest.java#L30), [SampleWorkflowTest.java:24](../src/test/java/com/smartlims/laboratory/SampleWorkflowTest.java#L24), [ResultPublicationTest.java:17](../src/test/java/com/smartlims/laboratory/ResultPublicationTest.java#L17), [LaboratoryConcurrencySecurityTest.java:39](../src/test/java/com/smartlims/laboratory/LaboratoryConcurrencySecurityTest.java#L39) |
| Patient publication concealment, archive, trends, dashboard, notifications | [PatientResultReportTest.java:33](../src/test/java/com/smartlims/laboratory/PatientResultReportTest.java#L33), [VisitArchiveTest.java:115](../src/test/java/com/smartlims/laboratory/VisitArchiveTest.java#L115), [HealthTrendTest.java:182](../src/test/java/com/smartlims/laboratory/HealthTrendTest.java#L182), [PatientDashboardTest.java:39](../src/test/java/com/smartlims/laboratory/PatientDashboardTest.java#L39), [PatientNotificationTest.java:126](../src/test/java/com/smartlims/laboratory/PatientNotificationTest.java#L126), [262](../src/test/java/com/smartlims/laboratory/PatientNotificationTest.java#L262) |

Tests frequently use both HTTP requests and direct services; an `assertThrows` without checking status does not establish a precise HTTP response. Several role matrices are parameterized, but this audit does not claim exhaustive role × endpoint × transport × account-state runtime coverage. F1/F2 direct-call consistency, F3 lifecycle handling, F4 notes wording and F6 the promoted-author publication edge remain distinct review items.

## Practical allowed and denied examples

Examples assume synthetic records, valid input/current revisions and a valid explicit Bearer token unless transport is the subject. Expected outcomes are derived from code, not requests executed in this audit.

| Scenario | Expected outcome |
|---|---|
| Anonymous registers with patient fields only | 200; unverified PATIENT account, no profile/JWT. Supplying role=ADMIN is 400 `INVALID_JSON` |
| Unlinked eligible PATIENT reads the catalog | Allowed for active tests; no profile required. Explicit `active=false` is 403; inactive detail is concealed 404 |
| Unlinked PATIENT requests own dashboard or notification inbox | 404 `PATIENT_PROFILE_NOT_LINKED`; no auto-creation |
| Linked PATIENT requests another patient's order/result/PDF/notification | 404 with that resource's not-found code; knowing a UUID grants nothing |
| ADMIN or RECEPTIONIST creates an order for an unlinked patient profile | Allowed with available tests and key; LAB_TECHNICIAN is 403 |
| ADMIN tries a patient `/me` order/result/profile route | 403; ADMIN has no patient-role bypass |
| RECEPTIONIST arrives a patient and completes an administrative visit | Allowed with workflow prerequisites; sample creation and result publication are 403 |
| Ordinary ADMIN lists samples or reads staff result detail | 403; allowlisted eligible ADMIN may do both |
| Allowlisted ADMIN creates/edits a result draft or correction | 403; these require LAB_TECHNICIAN |
| Technician edits another technician's unpublished result | Allowed with valid version/data; there is no creator-only restriction |
| Author becomes allowlisted ADMIN and tries approval of that version | 403 even after role change; another independent allowlisted ADMIN can approve |
| Eligible allowlisted approver publishes the approved version | Allowed if revision/evidence/state checks pass; same-person approval/publication is permitted |
| Authorized reviewer supplies stale expectedVersion | 409 `RESULT_CHANGED`; authority does not bypass concurrency |
| ADMIN cancels an IN_PROGRESS order | 409 `ORDER_NOT_CANCELLABLE`; a staff reason is still required |
| ADMIN blocks/deletes self or removes the last active confirmed ADMIN | 400 `LAST_ADMIN` |
| Cookie-authenticated allowed write without matching CSRF | 403 before the controller; explicit valid Bearer selects the exemption except cookie-login |
| Protected read has invalid Bearer header and a valid access cookie | 401; no cookie fallback. Malformed unsafe transport can first fail CSRF with 403 |
| Logout then reuse previously issued valid Bearer JWT | JWT can still authenticate until expiry or account ineligibility; logout is cookie clearing |

Audit deliverables: [endpoint inventory and counts](ENDPOINT_PERMISSIONS.md) and this report. Findings are recorded for review; no permission policy or backend implementation was changed.
