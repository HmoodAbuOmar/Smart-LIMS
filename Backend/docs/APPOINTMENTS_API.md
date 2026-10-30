# Appointments API

Stage 4 integration (DONE 2026-10-30; final isolated suite 319/319): actual arrival
through VISITS_API.md records CHECKED_IN; administrative visit close records
COMPLETED; ADMIN/RECEPTIONIST may mark an unvisited CONFIRMED appointment NO_SHOW
at/after slot end. Active capacity/order membership now means CONFIRMED or
CHECKED_IN. Only future CONFIRMED appointments retain direct reschedule/cancel
eligibility. Visit states are retained, never inferred from time; NO_SHOW and
COMPLETED release capacity. Upcoming remains future CONFIRMED, Past its complement.
All changes use a new V9 migration and existing order→coordination→appointment→slot
locking. Old Stage 3 two-state/deferral statements below are historical for that
stage and are superseded only by this expressly authorized visit foundation.

Status: Stage 3 DONE, 2026-10-29. All documented endpoints/rules are implemented.
One complete isolated `.\mvnw.cmd test` invocation passed 273 tests across 34 suites,
zero failures/errors/skips, finished 23:16:44 +02:00. See
[execution evidence](TESTING.md#stage-3-verification-2026-10-29). Owner manual HTTP
verification/commit remain separate; no deployment or development migration claim.
Traceability: S3-APT-R01–R07, Tasks 12–18 in [the plan](../IMPLEMENTATION_PLAN.md).
Storage/locking: [DATABASE_DESIGN.md](DATABASE_DESIGN.md#49-appointment_slots).
Existing JWT, cookie/CSRF and error envelopes apply.

## 1. Approved rules and UI coverage

The owner approved S3-APT-D01–D03 on 2026-10-29. The reviewed screenshot requires
booking, Upcoming/Past, date/time/type/status and Reschedule/Cancel. Responses also
expose appointment ID. No sample types, hours, appointments or clinical rules seeded.

- Timezone: **Asia/Jerusalem**, including DST. Store UTC instants. Input requires
  explicit RFC3339 offsets. Derive displayed date/time in the lab zone.
- ADMIN manages types. ADMIN/RECEPTIONIST publish explicit non-overlapping slots;
  capacity is shared across types. Half-open [start,end) intervals allow adjacency.
  Inactive slots also remain non-overlapping.
- Booking requires an existing PENDING order. PATIENT must own its linked profile;
  ADMIN/RECEPTIONIST may book for any existing patient's PENDING order, including
  an unlinked profile. LAB_TECHNICIAN has no appointment access.
- **Active = CONFIRMED**, irrespective of time. Active appointments consume capacity,
  enforce one active appointment per order and prohibit overlapping patient bookings.
  CANCELLED consumes none. Time passing never changes workflow status. Past CONFIRMED
  rows remain active pending legitimate cancellation or the later visit workflow.
- Initial CONFIRMED; only CONFIRMED→CANCELLED supported. Check-in/completion/no-show
  transitions remain deferred. No arbitrary status endpoint or appointment deletion.
- Patients act only on owned appointments; ADMIN/RECEPTIONIST may act for patients.
  Direct reschedule/cancel requires now < current start; no additional cutoff.
  Reschedule preserves type and requires a still-PENDING order. Rebooking after
  cancellation uses a new booking/key and retains the cancelled record.
- Appointment cancellation leaves the order unchanged. Cancelling a PENDING order
  atomically cancels its CONFIRMED appointment and releases capacity **even after
  start**. This required cascade is an exception to direct appointment cutoffs and
  preserves existing order-cancellation eligibility. Copy order actor/time/reason;
  no extra reason required. This supersedes Stage 2's absence of appointment effects.
- Upcoming = CONFIRMED and startsAt > one captured server instant. Past = exact
  complement: all CANCELLED, plus CONFIRMED with start <= now. End time is irrelevant.

## 2. Routes and access

All responses use Cache-Control: no-store. Canonical hyphenated UUIDs (hex case
accepted); reject unknown JSON/query fields and repeated query parameters.

| Method/path | Roles | Behavior |
|---|---|---|
| GET /api/appointment-types | PATIENT, ADMIN, RECEPTIONIST | Active types; page/size; includeInactive=true staff-only. |
| POST /api/appointment-types | ADMIN | Create type; 201. |
| PUT /api/appointment-types/{id} | ADMIN | Replace code/name/active; 200. |
| POST /api/appointment-slots | ADMIN, RECEPTIONIST | Publish slot; 201. |
| PUT /api/appointment-slots/{id} | ADMIN, RECEPTIONIST | Replace capacity/active only; 200; immutable times. |
| GET /api/appointment-slots/schedule | ADMIN, RECEPTIONIST | Full published schedule, including inactive/full/past; from/to/page/size. |
| GET /api/appointment-slots | PATIENT, ADMIN, RECEPTIONIST | Bookable slots for required orderId/typeId/from/to; page/size. |
| POST /api/appointments | PATIENT, ADMIN, RECEPTIONIST | Book; Idempotency-Key required; 201 new/200 replay. |
| GET /api/appointments/me | PATIENT | tab=UPCOMING (default) or PAST; page/size. |
| GET /api/appointments/me/{id} | PATIENT | Owned detail. |
| GET /api/appointments/{id}/alternatives | PATIENT, ADMIN, RECEPTIONIST | Valid alternatives; from/to/page/size; excludes current slot. |
| POST /api/appointments/{id}/reschedule | PATIENT, ADMIN, RECEPTIONIST | Atomic move; 200. |
| POST /api/appointments/{id}/cancel | PATIENT, ADMIN, RECEPTIONIST | Retained cancellation/repeat; 200. |

No general staff browsing/visit endpoints. Check current eligible stored role and
authentication authorities. Foreign/missing patient order IDs: same 404 ORDER_NOT_FOUND.
Foreign/missing/unlinked appointment IDs: same 404 APPOINTMENT_NOT_FOUND. Unlinked
patient list: 404 PATIENT_PROFILE_NOT_LINKED. Linked empty profile: empty 200 page.

## 3. Strict inputs and discovery

Type create/replace: {"code":"SYNTHETIC_VISIT","name":"Synthetic visit","active":true}.
code trimmed/uppercased, ASCII [A-Z0-9][A-Z0-9_-]{0,29}, unique; name trimmed,
nonblank, <=150 characters; active required JSON boolean. Deactivation prevents new
booking; existing appointments retain their type/name snapshot and can reschedule.

Slot create: {"startsAt":"2026-12-01T10:00:00+02:00","endsAt":"2026-12-01T10:30:00+02:00","capacity":2,"active":true}.
Valid offset timestamps require seconds and 0–6 fractional digits; no local-only time.
End > start; new start strictly future. capacity positive JSON integer within int
range; active required boolean. Update: {"capacity":3,"active":true}. Capacity cannot
fall below CONFIRMED occupancy. No time edits/deletion. Inactivation retains bookings.

Availability requires active type, accessible PENDING order with no active appointment,
and from/to. Alternatives derive order/type/owner from eligible appointment and allow
an inactive retained type. Only active future slots with capacity and no other active
patient booking appear. This is advisory; writes recheck under locks.

Slot queries require from/to offset timestamps, from < to, range <=31 days (technical
bound, not a booking horizon). Select startsAt >= from and < to. page=0, size=20 defaults;
digits only, page >=0 within int range, size 1–100. Sort slots by start asc/UUID asc,
types by code asc/UUID asc, Upcoming by start asc/UUID asc, Past by start desc/UUID asc.
Unknown tab/boolean, empty/repeated/unknown params, malformed/overflow inputs: 400.
No client patient/sort. Page fields: content,page,size,totalElements,totalPages,first,last.
Large JPA offsets return empty accurate-count pages without integer overflow.

## 4. Booking and representation

POST /api/appointments:

```json
{"orderId":"<order-uuid>","typeId":"<type-uuid>","slotId":"<slot-uuid>"}
```

Exactly one canonical UUID Idempotency-Key required. Identity = (creator,key); intent
= original order/type/slot. Same intent returns existing ID/current state even after
move/cancel, without fresh availability checks, but rechecks current role/ownership.
Different intent: 409 IDEMPOTENCY_KEY_REUSED. Failed writes do not consume keys. New
keys intentionally book subject to all constraints. Patient Location on create/replay:
/api/appointments/me/{id}; no fabricated staff read URI.

Appointment fields: id,orderId,slotId,typeId,typeName (snapshot),startsAt,endsAt (UTC),
timezone="Asia/Jerusalem",appointmentDate (YYYY-MM-DD),appointmentTime (HH:mm:ss with
fractions when present),utcOffset,status,version,canReschedule,canCancel,
actionIneligibilityReason,createdAt,updatedAt,cancelledAt,cancellationReason.
No demographics, staff account data or internal retry intent. Ineligibility reasons:
CANCELLED/STARTED, otherwise null; non-PENDING order gives ORDER_NOT_PENDING and disables
reschedule only (direct cancel remains time/status-based). Writes recheck eligibility.
Slot: id,startsAt,endsAt,capacity,remainingCapacity,active,timezone.
Type: id,code,name,active. Remaining capacity counts all CONFIRMED types together.

## 5. Reschedule and cancel

Reschedule: {"slotId":"<target-slot-uuid>","expectedVersion":0}; expectedVersion required
nonnegative JSON integer within long range. Require CONFIRMED, now < old start, PENDING
order and active/future target with capacity/no patient overlap. Preserve ID/order/type/
snapshot/creation/retry intent. Retain old/new slot, actor/time and revision in
appointment_reschedules. Release/reallocate atomically with stable slot locking.
Failure retains old booking. Stale revision: 409 APPOINTMENT_CHANGED, refresh first.
Immediate successful retry returns existing record when current revision=expected+1
and latest retained event matches expected revision/target; creates no further event.
Same current slot/current version is an eligible no-op. Alternatives exclude current
slot. Later changes invalidate stale retries and never silently revert a booking.

Cancel: {} or {"reason":"Synthetic cancellation requested"}. reason strict string/null,
trimmed, <=1000 characters. Patient blank/null/omitted becomes null; staff require
nonblank. Eligible CONFIRMED becomes CANCELLED with original actor/time/reason, retained
relationships and revised version. Authorized CANCELLED repeats preserve metadata even
after start (staff reason validation still applies). First cancel at/after start: 409
APPOINTMENT_NOT_CHANGEABLE. Concurrent actions/order cascade cannot double-release.

## 6. Errors and boundaries

Envelope: {code,message,fieldErrors,requestId}; matching X-Request-Id/no-store.
Existing 401 UNAUTHORIZED/403 FORBIDDEN and cookie CSRF apply.

| HTTP | code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid field/path/header/query. |
| 400 | INVALID_JSON | Missing/malformed object, wrong types, unknown properties. |
| 404 | PATIENT_PROFILE_NOT_LINKED / ORDER_NOT_FOUND / APPOINTMENT_NOT_FOUND | Identity/ownership privacy. |
| 404 | APPOINTMENT_TYPE_NOT_FOUND / APPOINTMENT_SLOT_NOT_FOUND | Missing management target. |
| 409 | APPOINTMENT_TYPE_UNAVAILABLE | Missing/inactive booking type. |
| 409 | ORDER_NOT_BOOKABLE | Non-PENDING order or active appointment exists. |
| 409 | APPOINTMENT_SLOT_UNAVAILABLE | Missing/inactive/past/full target or patient overlap. |
| 409 | APPOINTMENT_NOT_CHANGEABLE | Cancelled/started or reschedule order non-PENDING. |
| 409 | APPOINTMENT_CHANGED | Stale reschedule revision. |
| 409 | APPOINTMENT_SCHEDULE_CONFLICT | Slot overlap, duplicate type code or capacity below occupancy. |
| 409 | IDEMPOTENCY_KEY_REUSED | Creator/key reused for different original intent. |

No payment/sample/result/notification/general-audit work or visit transitions. Actual
focused/full verification belongs in [TESTING.md](TESTING.md); manual examples are not
execution evidence. No Postman tools/resources used or generated.

## 7. Manual HTTP examples (not executed)

Use a local application base URL, e.g. http://localhost:8080, synthetic accounts
and Content-Type: application/json. Authorization: Bearer <caller-token>. Cookie
writes instead require access_token plus matching XSRF-TOKEN cookie/X-XSRF-TOKEN
header obtained from GET /api/auth/csrf-token. Never record raw tokens.

| Step / actor | Exact request and expected result |
|---|---|
| Type / ADMIN | POST /api/appointment-types with `{"code":"SYNTHETIC_VISIT","name":"Synthetic visit","active":true}` → 201; save typeId. GET /api/appointment-types?includeInactive=true&page=0&size=20. PUT /api/appointment-types/{typeId} replaces the same full body (active=false removes from patient discovery). |
| Slots / ADMIN or RECEPTIONIST | POST /api/appointment-slots with `{"startsAt":"2030-01-15T10:00:00+02:00","endsAt":"2030-01-15T10:30:00+02:00","capacity":2,"active":true}` → 201; save slotA. Repeat with start 10:30/end 11:00 for slotB. Times must still be future and not overlap existing slots; choose another date if necessary. |
| Schedule / staff | GET /api/appointment-slots/schedule?from=2030-01-15T00:00:00Z&to=2030-01-16T00:00:00Z&page=0&size=20. PUT /api/appointment-slots/{slotA} with `{"capacity":3,"active":true}` → 200. |
| Order / PATIENT | Use an existing owned PENDING order or POST /api/orders/me with `{"testIds":["<active-test-uuid>"]}` and a fresh UUID Idempotency-Key; save returned orderId. No appointment/payment created by order creation. |
| Discovery / PATIENT | GET /api/appointment-types?page=0&size=20, then GET /api/appointment-slots?orderId={orderId}&typeId={typeId}&from=2030-01-15T00:00:00Z&to=2030-01-16T00:00:00Z&page=0&size=20. Encode + as %2B if using offsets in query parameters. |
| Book / PATIENT or staff | POST /api/appointments with a fresh UUID Idempotency-Key and `{"orderId":"<orderId>","typeId":"<typeId>","slotId":"<slotA>"}` → 201 CONFIRMED, version=0, action flags true; save appointmentId. Same body/key → 200 same ID. Different slot/same key → 409 IDEMPOTENCY_KEY_REUSED. |
| Lists/detail / PATIENT | GET /api/appointments/me?tab=UPCOMING&page=0&size=20; GET /api/appointments/me?tab=PAST&page=0&size=20; GET /api/appointments/me/{appointmentId}. Inspect ID/date/time/type/status/zone/offset/actions. Foreign patient detail →404. |
| Alternatives / owner or staff | GET /api/appointments/{appointmentId}/alternatives?from=2030-01-15T00:00:00Z&to=2030-01-16T00:00:00Z&page=0&size=20. Current/full/inactive/conflicting slots excluded. |
| Reschedule / owner or staff | POST /api/appointments/{appointmentId}/reschedule with `{"slotId":"<slotB>","expectedVersion":0}` →200, same ID/type, version=1. Exact immediate repeat →same version. Stale revision/different target →409. |
| Cancel / owner | POST /api/appointments/{appointmentId}/cancel with `{}` →200 CANCELLED, flags false; retained in PAST, order unchanged. Repeat preserves metadata. Staff require `{"reason":"Synthetic cancellation requested"}`. |
| Rebook/cascade | Rebook the PENDING order with a fresh UUID key. POST /api/orders/{orderId}/cancel with `{}` as patient (staff require reason) →both order and active appointment CANCELLED atomically; older cancelled rows unchanged. |

Negative checks: LAB_TECHNICIAN→403; foreign order/appointment→404; unknown/wrong-type
JSON, invalid/multiple booking key, malformed offsets, repeated/unknown query→400;
full/inactive target, duplicate active order/patient slot, overlapping publication,
capacity below occupancy→409. First direct change at/after start→409; linked
PENDING-order cancellation still cascades. Refresh availability/detail after conflict.
This is a manual handoff, not executed HTTP/Postman evidence or deployment validation.
