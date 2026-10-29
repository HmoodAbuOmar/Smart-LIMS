# Orders API Contract

Stage 3 integration (2026-10-29): cancelling a PENDING order atomically cancels its
CONFIRMED appointment, if any, and releases capacity even after slot start. Copy
the order cancellation actor/time/reason; retain both records. Order eligibility,
repeats, ownership and original items/prices remain unchanged. Appointment
cancellation alone leaves the order unchanged. The detailed
[appointment contract](APPOINTMENTS_API.md) and database sections 4.9–4.10 supersede
older Stage 2 statements below about absence of appointment-cancellation effects.
Check-in/completion/no-show remain deferred.

Status: finalized design for Stage 2 Task 6, 2026-10-28. Tasks 7-10 implement V7 storage/mappings, creation/replay, owned patient list/detail and atomic cancellation with retained metadata. [Task 11 technical verification](TESTING.md#task-11-full-stage-verification-2026-10-28) passes one complete invocation of 236 tests across 27 suites, with zero failures/errors/skips. Task 11 and Stage 2 are DONE based on that passing evidence. The owner's 2026-10-29 clarification makes committing a separate handoff, not an acceptance criterion; no tests were rerun or commit/push performed for this correction. No Postman was used in this verification. Local tests do not establish deployment readiness.

Traceability: R-ORD-01/R-NFR-01; Stage 2 Tasks 6–11 in the [local plan](../IMPLEMENTATION_PLAN.md#stage-2--patient-orders). Local acceptance IDs: S2-ORD-R01 creation/identity, R02 patient reads, R03 cancellation, R04 snapshots/totals, R05 retries/concurrency. Reuse [patient identity/linking](PATIENTS_API.md), [catalog](LAB_TESTS_API.md), and [database design sections 4.7–4.8](DATABASE_DESIGN.md#47-test_orders). This is the single detailed order API reference.

## 1. Confirmed rules and technical choices

The confirmed Stage 2 rules govern: PATIENT self-orders require their linked profile; ADMIN/RECEPTIONIST may create for an existing profile, including one with no account; LAB_TECHNICIAN cannot create. Patients access only their own orders. Initial status is PENDING. Creation has no appointment/payment effect. Only a PENDING order can be newly cancelled; staff cancellation requires a reason. Retain cancelled orders and record cancellation actor/time. IN_PROGRESS and COMPLETED are reserved for future laboratory/results workflows.

Two additional owner decisions were confirmed during Task 6:

| Decision | Confirmed rule |
|---|---|
| S2-ORD-D01 | Both create endpoints require Idempotency-Key. Same actor/key/selection returns the existing order; a different key permits an intentional new order. |
| S2-ORD-D02 | An authorized repeat of cancellation returns the existing CANCELLED order without replacing its original actor, time, or reason. |

The implementation choices below settle technical details rather than invent clinical policy: UUID resource IDs and retry keys; sequence-based visible numbers; one occurrence of each selected test with no quantity; at most 100 selections per request as an operational payload bound; BigDecimal snapshot sums; exact enum validation; existing page/error/authentication conventions. No minimum payable amount is introduced: zero-priced active catalog tests remain selectable. No tax, discount, refund, specimen, clinical range, or publication authority is inferred.

## 2. Screen and existing-design review

Reviewed [my-orders.jpeg](../ui-references/my-orders.jpeg). The screen shows All/Pending/In progress/Completed/Cancelled tabs, order-number search, order number/date/test count/amount/status columns, View details, and optional View visit details. The global laboratory-test search belongs to the existing catalog. Sidebar destinations and sample rows do not authorize additional APIs, visits, clinical data, or seeded orders.

| Screen element | Contract |
|---|---|
| Tabs | One optional exact status filter; All omits status. |
| Order-number search | search is a literal case-insensitive substring of orderNumber only. |
| Date | createdAt UTC instant; UI may display Asia/Jerusalem date. |
| Tests / amount | Original item count and sum of immutable order prices, including after cancellation. The screenshot retains an amount for a cancelled row. |
| View details | Owned detail route below. |
| View visit details | visitDetailsAvailable=false in Stage 2; no ID/URL is fabricated from order number or status. |

At the Task 6 review, no order API document or executable order implementation was found. The carried-forward database proposal used NEW, ONLINE/WALK_IN, item editing/cancellation, and payment reconciliation. Sections 4.7–4.8 are reconciled to PENDING and this stage: no item-edit API, no inferred physical visit/source, no payment/appointment coupling. Task 7 adds persistence and a catalog snapshot-lock repository method; applied V1–V6 and existing API behavior remain unchanged.

## 3. Endpoints and access

All paths use JSON, existing eligible-account authentication, and backend role/ownership checks. /me is PATIENT-only, following the patient module; staff creation/cancellation does not create a staff browsing API.

| Method/path | PATIENT | ADMIN / RECEPTIONIST | LAB_TECHNICIAN | Success |
|---|---|---|---|---|
| POST /api/orders/me | Own linked profile only | 403 | 403 | 201 new; 200 replay; detail DTO |
| POST /api/orders | 403 | Existing patientId | 403 | 201 new; 200 replay; detail DTO |
| GET /api/orders/me | Own linked profile only | 403 | 403 | 200 page |
| GET /api/orders/me/{id} | Owned order only | 403 | 403 | 200 detail |
| POST /api/orders/{id}/cancel | Owned order only | Any existing order, subject to state/reason | 403 | 200 detail, including repeat |

There is no GET /api/orders, staff GET /api/orders/{id}, DELETE, item-edit, or arbitrary status endpoint in this stage. Staff receive the authorized create/cancel response; general staff order browsing requires a later explicit contract.

PATIENT ownership follows test_orders.patient_id → patients.user_id = authenticated account UUID, never created_by, a claimed role, email, name, phone, or a client-supplied patient/user ID. Consequently staff-created orders become visible to the legitimate patient when that profile is linked using the existing verified workflow. No automatic profile creation/linking occurs. A staff-selected patient need not have a login account. Reuse stored-account eligibility/current-role checks; no role is trusted from request fields.

For POST/GET /me with no linked profile, return existing 404 PATIENT_PROFILE_NOT_LINKED, message `No patient profile is linked to this account.`, empty fieldErrors. A linked patient with no orders gets an empty 200 page. Detail/cancel lookup instead returns 404 ORDER_NOT_FOUND for a missing, unowned, or unlinked order, without disclosing another patient's data. Staff creation with a well-formed but nonexistent patientId returns 404 PATIENT_NOT_FOUND.

Preserve bearer-over-cookie precedence, existing eligibility and JWT behavior, and cookie-write CSRF. Anonymous GET and writes that reach authentication return 401; existing CSRF rejection may return 403 first for writes without valid bearer/CSRF. Cookie clients use GET /api/auth/csrf-token, access_token/XSRF-TOKEN cookies and X-XSRF-TOKEN. Task 8 allows the exact Idempotency-Key request header in the existing CORS configuration; configured origins, credentials policy and existing exposed Location/X-Request-Id headers are retained. No authentication strategy or new public route is introduced.

## 4. Create requests and validation

Both POSTs require Content-Type: application/json and exactly one Idempotency-Key header containing a canonical UUID (case-insensitive hex, normalized before storage; no blank/padded/comma-separated/multiple values). Missing/invalid key is 400 VALIDATION_ERROR on idempotencyKey. UUIDv4 is recommended for clients; the server never treats a key as authorization.

Self request:

```json
{"testIds":["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"]}
```

Staff request:

```json
{"patientId":"33333333-3333-4333-8333-333333333333","testIds":["11111111-1111-4111-8111-111111111111"]}
```

| Field | Rules |
|---|---|
| testIds | Required non-null array, 1–100 canonical UUID strings; no nulls or duplicates, including differently cased forms of the same UUID. Do not deduplicate silently. Request order is immaterial. |
| patientId | Staff create only; required canonical UUID string of an existing profile. Self-create has no patientId/userId field. |

Preserve strict JSON types/unknown-property rejection from application.yaml. Malformed JSON, unknown properties, wrong containers, and non-string non-null UUID elements use INVALID_JSON; correct-type missing/null/blank/malformed UUID values and duplicate/empty/oversized selections use VALIDATION_ERROR on testIds or patientId. Path UUIDs use existing canonical-form validation, accepting hex letter case; malformed id is VALIDATION_ERROR on id.

Clients cannot submit order/item IDs, orderNumber, prices, currency, total, count, status, actor, notes, cancellation metadata, appointment/payment/visit/result data. Unknown fields are rejected, rather than trusted or silently applied. PATIENT cannot select another profile. After authentication/role and request syntax validation, resolve identity and retry state before checking fresh catalog availability.

For a new order, every selected test must exist and be active for **both** patient and staff creation. Active uncategorized tests are valid. No inactive-test staff override is introduced. A missing/inactive test rejects the entire selection with 409 ORDER_TEST_UNAVAILABLE; message and fieldErrors.testIds are both `One or more selected tests are unavailable.` No partial order or hidden catalog details are returned. The server reads current catalog code/name/price/currency while holding the catalog locks below, copies snapshots, and calculates the total. Later catalog deactivation/repricing/renaming must not invalidate an existing order or alter its historical response.

## 5. Numbers, totals, snapshots, and retry transactions

Generate order numbers from a new PostgreSQL BIGINT sequence, start 1/increment 1, never MAX+1 or a resettable daily counter. Format ORD- plus at least six decimal digits (ORD-000001; larger sequence values expand). order_number is unique VARCHAR(30); gaps from rollback/caching are normal and numbers are not reused or authorization secrets. The screenshot's SAMPLE identifiers are illustrative, not a required numbering scheme.

Create exactly one order item per selected test, quantity implicitly one. Copy lab_test_id, test_code_snapshot, test_name_snapshot and price_at_order; retain order currency ILS. The response reads these stored snapshots, never current catalog name/price. Categories and specimen/preparation fields remain catalog data and are not implied historical order-item fields. There is no independent item-state/cancellation workflow in Stage 2.

testCount is the count of all original items. totalAmount is their exact BigDecimal sum; NUMERIC(12,2) per-item precision is reused, while the aggregate is not narrowed back to that precision. At the 100-item bound the largest sum is 999999999999.00. Return a JSON number with monetary scale two and currency ILS. No client total, floating-point arithmetic, or mutable competing header total. Cancellation retains items/count/amount; this is historical order value, **not** outstanding balance, payment confirmation, or refund entitlement.

Durable idempotency is part of the order row, not a cache/time-window/name/price heuristic:

1. Scope the UUID key to created_by across both create routes: UNIQUE(created_by, idempotency_key). Different actors have independent key namespaces.
2. Persist request_hash: SHA-256 lowercase hex over UTF-8 canonical JSON with fixed property order operation, patientId, testIds; operation is SELF or STAFF, patientId is the resolved lowercase UUID, and testIds are normalized lowercase UUIDs sorted lexically. No whitespace or current prices/status in the canonical data. The immutable item IDs and patient/creator references retain the underlying intent.
3. Lock/recheck the current account (existing user-row lock convention), resolve/lock the patient, then inspect a prior successful key. Matching intent returns the same order ID/number, snapshots and **current** order state with 200; no repricing, fresh active check, new cancellation metadata, timestamps or side effects. Recheck current authorization/ownership on every replay. A same-key/different operation/profile/selection returns 409 IDEMPOTENCY_KEY_REUSED, field idempotencyKey.
4. No prior success: lock selected catalog rows in ascending UUID order using shared/pessimistic-read locks compatible with current catalog write locks; validate all, allocate number, insert order PENDING and all items, flush/commit once. A failed transaction consumes no successful key or partial order/items; sequence gaps are permitted. The same key may be retried after failure. Same selection/new key creates an intentional new order.
5. Serialize same-actor creations through the account lock, with the unique constraint authoritative. A race on the unique key must roll back the failed transaction before rereading the winner in a fresh transaction; never continue in an aborted transaction or return 500 for an ordinary matching retry. Infrastructure/timeouts roll back; a client retries with its original key after an uncertain outcome.

Patient/account-before-catalog locking reuses existing linking conventions. Cancellation locks only its order row (then rechecks state/ownership); do not introduce an inverted order→account/patient lock path. Future processing transitions must contend on that same order lock. Task 8 implements creation locking and retry recovery; Task 10 implements cancellation. Processing transitions remain later workflows.

New self-order: 201, Location: /api/orders/me/{id}, detail body. Self replay: 200 with the same location. Staff create/replay: 201/200 detail body, **no Location pointing to an unauthorized or nonexistent staff detail route**. This is an intentional difference from modules that already provide staff reads.

## 6. Responses and patient queries

Summary fields, all required: id UUID, orderNumber string, createdAt UTC instant, updatedAt UTC instant, testCount integer, totalAmount JSON number, currency ILS, status enum, canCancel boolean, visitDetailsAvailable boolean. canCancel reflects current caller ownership/role and PENDING state; the write endpoint still rechecks. visitDetailsAvailable is always false in Stage 2 because no real visit relationship exists.

Detail adds patientId UUID (profile identity, not an account ID), items array, cancelledAt nullable UTC instant, and cancellationReason nullable string. Each item has id UUID, labTestId UUID, testCode string snapshot, testName string snapshot and priceAtOrder JSON number. Sort items by snapshot testCode ascending, then item UUID ascending, for deterministic display independent of request/catalog order. Never expose request_hash, idempotency_key, account credentials, patient demographics, or persistence entities; cancellation actor is stored internally rather than exposing a staff account record.

Synthetic detail for the single-test staff-create example (equally readable by that profile's linked patient):

```json
{
  "id":"44444444-4444-4444-8444-444444444444",
  "orderNumber":"ORD-000001",
  "createdAt":"2026-10-28T12:00:00Z",
  "updatedAt":"2026-10-28T12:00:00Z",
  "testCount":1,
  "totalAmount":25.50,
  "currency":"ILS",
  "status":"PENDING",
  "canCancel":true,
  "visitDetailsAvailable":false,
  "patientId":"33333333-3333-4333-8333-333333333333",
  "items":[{
    "id":"55555555-5555-4555-8555-555555555555",
    "labTestId":"11111111-1111-4111-8111-111111111111",
    "testCode":"DEMO_TEST",
    "testName":"Synthetic ordered test",
    "priceAtOrder":25.50
  }],
  "cancelledAt":null,
  "cancellationReason":null
}
```

GET /api/orders/me accepts the following; filter by ownership first and combine search/status with AND before pagination/counting:

| Query | Default | Validation / meaning |
|---|---|---|
| search | Empty | Trim, at most 30 characters, case-insensitive literal order-number substring only. %, _ and backslash remain literal. Blank is allowed. |
| status | Omitted | Exactly PENDING, IN_PROGRESS, COMPLETED, or CANCELLED. No All, blank, padded/lowercase/comma-separated/null string. |
| page | 0 | Decimal digits, integer 0 through 2147483647. |
| size | 20 | Decimal digits, integer 1–100. |
| sort | createdAt,desc | orderNumber, createdAt, or updatedAt plus exact ,asc or ,desc; UUID ascending tie-breaker. No computed/clinical sorts. |

Every supported key may appear once only, including identical repetition; use 400 VALIDATION_ERROR keyed to that parameter. Unknown query keys remain ignored as in existing catalog/patient queries and cannot select another patient. Do not accept client patientId as an ownership filter. Count unique orders, not item-join rows; aggregate item count/sum per order without multiplying content or totals. Preserve the existing large-offset empty-page handling and validate syntax before domain lookup.

Page shape: content of summaries, page, size, totalElements, totalPages, first, last. A linked patient with no matches gets the following; a distant page also has empty content with actual filtered totals:

```json
{"content":[],"page":0,"size":20,"totalElements":0,"totalPages":0,"first":true,"last":true}
```

IN_PROGRESS/COMPLETED filters are valid even though Stage 2 exposes no transitions into those states; absence of matching real data means an empty page, not simulated records.

## 7. Cancellation and lifecycle

POST /api/orders/{id}/cancel requires a JSON object. PATIENT may send `{}` or an optional reason; ADMIN/RECEPTIONIST must provide a nonblank reason. reason is a strict JSON string, trimmed, at most 1,000 characters. PATIENT omission/null/blank becomes null. Staff omission/null/blank is 400 VALIDATION_ERROR on reason. Missing body/malformed types/unknown fields use INVALID_JSON. Idempotency-Key is not required for cancellation; the row/state makes approved repetition safe.

```json
{"reason":"Synthetic cancellation requested at reception"}
```

After normal transport/role/body/UUID checks, lock the order, enforce patient ownership if applicable, and validate current state:

| Existing state | Authorized request |
|---|---|
| PENDING | Set CANCELLED, cancelled_by=current account, cancelled_at=server UTC instant, cancellation_reason=validated reason, updated_at accordingly; retain items and original snapshots. Return 200 detail, canCancel=false. |
| CANCELLED | Owner-confirmed repeat: 200 existing detail; preserve first actor/time/reason and updated_at, even if a later authorized caller supplies another valid reason. Body validation (including staff reason) still applies. |
| IN_PROGRESS / COMPLETED | 409 ORDER_NOT_CANCELLABLE, empty fieldErrors; no mutation. |

Missing/unowned patient orders are always the same 404 before state is disclosed; a repeated request does not bypass role/ownership. Concurrent cancellations return one persisted cancellation record; a second authorized request observes CANCELLED and returns it. No item deletion, reopening, arbitrary PATCH status, partial cancellation, repricing, automatic refund, or appointment/visit cancellation is implemented in Stage 2.

Future transitions must be separately designed: PENDING→IN_PROGRESS when laboratory processing genuinely starts; IN_PROGRESS→COMPLETED only when every ordered test is complete with approved, patient-published results. Stage 2 defines these meanings, not who may approve/publish or clinical thresholds. Cancellation after processing starts and future refund/appointment reconciliation require their own approved contracts.

## 8. Error contract and evaluation order

Reuse `{code,message,fieldErrors,requestId}`, matching X-Request-Id and Cache-Control: no-store; fieldErrors is an object, empty without a field. No SQL, stack trace, hidden patient/order/test details, retry hash, or secret key in error/log output. Existing method/content-type framework handling and security precedence remain; not every framework 405/415 body is guaranteed to use this envelope.

| HTTP | code | Context / field |
|---|---|---|
| 400 | INVALID_JSON | Malformed/missing body, unknown properties, wrong JSON types; empty fieldErrors. |
| 400 | VALIDATION_ERROR | UUID syntax, required/empty/duplicate/oversized testIds, staff patientId/reason, invalid idempotencyKey or supported query syntax; use that field/key. |
| 401 | UNAUTHORIZED | Missing, invalid or ineligible authentication after existing CSRF precedence. |
| 403 | FORBIDDEN | Disallowed role or cookie CSRF; no ownership-based 403 oracle. |
| 404 | PATIENT_PROFILE_NOT_LINKED | Self create/list without a linked profile; existing patient-module message. |
| 404 | PATIENT_NOT_FOUND | Staff create targets a nonexistent profile. |
| 404 | ORDER_NOT_FOUND | Missing or inaccessible detail/cancel order; `Order not found.` and empty fieldErrors. |
| 409 | ORDER_TEST_UNAVAILABLE | Fresh create selection contains any missing/inactive test; generic message and testIds field as above. |
| 409 | IDEMPOTENCY_KEY_REUSED | A successful same-actor key has another intent; `Idempotency key was already used for a different order request.`, idempotencyKey field. |
| 409 | ORDER_NOT_CANCELLABLE | Processing/completed order; `Only pending orders can be cancelled.`, empty fieldErrors. |
| 405 / 415 | Existing framework behavior | Unsupported method/media type after security checks; preserve HTTP status. |
| 500 | INTERNAL_SERVER_ERROR | Unexpected failure; `An unexpected error occurred.`, no internals. |

After security: validate body/header/query/path syntax; enforce applicable profile/ownership; resolve replay before fresh catalog checks; then validate live state/availability and write atomically. Do not consume keys on failed writes. No automatic retry of validation/permission/state conflicts. After network uncertainty retry create with the same key; cancellation may repeat as specified.

```json
{"code":"ORDER_NOT_FOUND","message":"Order not found.","fieldErrors":{},"requestId":"66666666-6666-4666-8666-666666666666"}
```

## 9. Storage, future boundaries, and acceptance evidence

The authoritative schema is [DATABASE_DESIGN.md sections 4.7–4.8](DATABASE_DESIGN.md#47-test_orders), implemented in V7 by Task 7: test_orders/order_items, retained FKs, header cancellation metadata, durable scoped retry identity, sequence, immutable code/name/price snapshots and no mutable total. Database checks enforce snapshot formats/prices, ILS, cancellation consistency and unique membership/retry/number constraints. Task 8 enforces nonempty complete bounded aggregates, active catalog admission, currency compatibility and the complete creation transaction; ordinary SQL CHECK cannot inspect child rows. Tasks 8-10 use V7 without schema changes. Creation, patient reads and cancellation satisfy Task 11 acceptance. Task 11 and Stage 2 are DONE; the owner commit is a separate handoff.

Task 8 implementation: OrderService validates requests and the exact single retry header; OrderCreationTransactions locks/rechecks the current stored account, resolves/locks the patient and checks durable intent before fresh catalog admission. Catalog locks use normalized lexical UUID order. The header/items flush together; database timestamp precision is used on both initial and replay responses. Create and unique-collision replay run through separate proxied REQUIRES_NEW methods, so the failed create rolls back before winner lookup and renewed authorization. Only the named retry uniqueness violation invokes this fallback. OrderMapper returns snapshot-based detail with exact BigDecimal totals inside the transaction. Creation success uses 201/200 as specified and Cache-Control: no-store. Self Location identifies the owned detail URI implemented by Task 9.

Task 9 implementation: OrderQueryRequest validates the exact supported query syntax before profile lookup. OrderReadService rechecks eligible current PATIENT roles, returns PATIENT_PROFILE_NOT_LINKED for an unlinked list caller, and constrains every order lookup/filter through patients.user_id. List/count queries page unique order headers without item joins; one grouped item count/SUM query covers only the selected page. Detail and summary read historical snapshots; all response mapping stays in read-only transactions. Distant pages retain filtered totals, including correct last metadata at page 2147483647 using long arithmetic. Exact patient-only GET matchers and Cache-Control: no-store are configured; no staff read or visit route is added.

Task 10 implementation: CancelOrderRequest accepts only a strict string reason and normalizes optional blank values. OrderCancellationService validates the request/path, rechecks eligible current roles without account/patient write locks, requires a staff reason, locks the order and verifies patient ownership before checking state. A first PENDING cancellation stores the current actor, a server UTC time truncated to database microseconds, the reason and the ORM-maintained update time in one transaction. Flush/refresh returns persisted timestamp precision. An authorized CANCELLED repeat maps the existing record without changing it; staff reason validation still applies. Other states return ORDER_NOT_CANCELLABLE; missing/unowned/unlinked patient orders return the same ORDER_NOT_FOUND. Items, historical values and creation retry identity are retained. The exact cancellation POST matcher preserves existing JWT, CSRF and deny-by-default behavior.

Follow the existing com.smartlims module structure in a new orders package: controller, service, dto, entity, repository, mapper, specification and exception responsibilities as needed. Keep controllers thin; DTO validation and service authorization/ownership precede persistence/response mapping. Service writes use explicit transactions and reads map lazy data inside read-only transactions because open-in-view is false. Add controller-scoped order error advice that maps the existing profile-not-linked/missing-profile meanings into the shared envelope; existing patient/catalog advice is scoped to those controllers and cannot be assumed to handle order exceptions. Add only the exact method/path/role security matchers as each later endpoint is implemented, preserving the deny-by-default rule; do not grant broad /api/orders/** access or use security matchers as a substitute for service ownership checks.

Orders are not visits. No visit table/ID/link, appointment row/slot reservation, payment record/status/balance, sample, processing job, result/report URL, notification delivery, or audit-log subsystem is created by these endpoints. Header created_by/cancelled_by/timestamps supply the required actor metadata without claiming a future general audit workflow. No catalog/cart persistent selection API is needed. Future appointment/payment/result/sample integration must explicitly reconcile retained orders and cancellation under shared transaction/lock rules before it is enabled; older future design paragraphs are not Stage 2 side effects.

Task 6 verification was source/document/image inspection only. Tasks 7-10 have separate focused persistence, creation, read and cancellation evidence, including corrections and concurrency checks, in TESTING.md. Task 11 now records a single green full-suite invocation on the independently verified disposable PostgreSQL cluster: 236 tests, 0 failures/errors/skips. Task 11 and Stage 2 are DONE with all acceptance criteria met. Committing is a separate owner handoff and does not gate completion. No further stage, Postman execution, production migration or deployment was performed. Unexecuted manual HTTP scenarios are documented separately from automated evidence.
