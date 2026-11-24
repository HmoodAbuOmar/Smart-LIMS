# Appointments API

## Receptionist Today

`GET /api/appointments/today` accepts an optional `tab` of `arrivals`
(default), `checkedIn`, or `notArrived`, and optional `date` in `YYYY-MM-DD`
format. ADMIN and RECEPTIONIST can read it. The read uses `Cache-Control:
no-store`. The date defaults to the current Asia/Jerusalem date. Scheduled slot
starts are selected from that day's local midnight up to, but excluding, the
next local midnight, including daylight-saving changes. Sort order is slot
start, then appointment ID. Unknown or repeated parameters and invalid dates or
tabs return `400 VALIDATION_ERROR`.

The response contains `date`, `timezone`, `counts` and `content`. Counts
cover the entire day regardless of tab. Arrivals includes every persisted
status. Checked In includes only CHECKED_IN. Not Arrived includes only
CONFIRMED, projected as BOOKED for this screen. Cancelled, completed and
no-show rows appear only in Arrivals. Empty results return an empty array.
Check-in leaves the appointment in Arrivals, moves it out of Not Arrived, and
adds it to Checked In. Refresh reads the latest committed data.
An elapsed slot remains in Not Arrived while its appointment is CONFIRMED.
Recording a no-show removes it from Not Arrived while preserving its Arrivals
row. Membership and check-in eligibility are separate. A confirmed appointment
can appear in Not Arrived with check-in disabled if its order cannot be processed.

Rows contain `id`, `startsAt`, `endsAt`, `appointmentDate`,
`appointmentTime`, `patient` (ID, file number and full name), `orderId`,
`orderNumber`, `orderItemIds`, `status`, `version`, `arrivedAt`,
`checkInEligible` and `noShowSupported`. The stored check-in instant remains
visible on completed rows. Every persisted appointment requires an existing
order linked to a patient. PostgreSQL enforces both references. Defensive
null handling in the response does not establish an orderless workflow.
The orderless example in Screenshots 02 and 03 is excluded from acceptance
criteria. Use an order-linked booking to demonstrate disabled check-in.

Check-in reuses `POST /api/visits` with `Idempotency-Key`, the selected row's
order ID, appointment ID, order item IDs, an arrival instant, and the row
version as the optional `expectedAppointmentVersion`. A stale version on
a confirmed appointment returns `409 APPOINTMENT_CHANGED`. An ineligible
appointment returns `409 APPOINTMENT_STATE_CONFLICT` for a new request.
Today and the Appointments List enable check-in only on the slot's scheduled
date in `Asia/Jerusalem`. For a new scheduled check-in, both the server's current
date and the supplied arrival instant must fall on that date. Walk-ins are
unaffected. An identical replay with the same key returns the existing visit. Read Today
again after the write to get the updated row and counts.

NOTIF-38 (2026-10-31): actual booking, slot move, direct/cascaded cancellation,
check-in, completion and no-show changes now persist patient in-app notifications
in the source transaction. No-op/replay adds none; a notification write failure
rolls back the workflow. See [NOTIFICATIONS_API.md](NOTIFICATIONS_API.md). Existing
appointment API inputs, access, time/capacity rules and state transitions remain.

Migration-version references in historical sections describe the original V1-V9
implementation. The current application migration set is canonical V1-V29 from
`src/main/resources/db/migration`; the earlier V1-V9 SQL remains only in test
fixtures for compatibility coverage. See [MIGRATION_LINEAGES.md](MIGRATION_LINEAGES.md).

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

## Receptionist Appointments List

`GET /api/receptionist/appointments` requires the Receptionist role and returns `Cache-Control: no-store`.

The same required order relationship applies to Screenshot 08. Each persisted
appointment row links to its order. The orderless example is excluded from
acceptance criteria.

- `date` uses `YYYY-MM-DD` and defaults to today in `Asia/Jerusalem`. The query includes slots starting at local midnight and excludes the next local midnight.
- `status` accepts `ALL` (default), `BOOKED` (also accepted as `CONFIRMED`), `CHECKED_IN`, `COMPLETED`, `CANCELLED`, and `NO_SHOW`, case-insensitively. Responses display `BOOKED` for confirmed appointments.
- `search` matches a case-insensitive substring of the patient name, file number, or order number, up to 100 characters after trimming.
- `sort` accepts `startsAt,asc` (default) and `startsAt,desc`. Appointments starting at the same time are ordered by ID.
- `page` defaults to zero and `size` defaults to 20, with a maximum of 100. The response has `date`, `timezone`, `content`, `page`, `size`, `totalElements`, `totalPages`, `first`, and `last`. Totals reflect the combined filters.

Rows provide the appointment and slot IDs, slot start and end, local appointment date and time, `booked`, `capacity`, patient ID/name/file number, order ID/number, status, version, arrival time, and action eligibility. Booked capacity counts confirmed and checked-in appointments across the entire slot, including rows outside the current filter or page. Check-in uses `POST /api/visits` with the row's appointment ID, order ID, order item IDs, version as `expectedAppointmentVersion`, arrival time, and an idempotency key. Follow order links through `GET /api/receptionist/orders/{id}`.

The current page uses the development Today service and expects an array with localized patient names. Live integration needs to read the paged `content`, map `patient.fullName` for display, handle absent patient and order references, and use the returned eligibility fields. Refresh repeats the current GET. The create booking button opens Screenshot 09, which still needs live order and slot selection wired to the existing booking API. The booking contract uses order and slot IDs. The development editor still references appointment types.

## Receptionist Create Booking

Booking requires an existing order. The availability and booking endpoints
require an order ID and reject orders that are ineligible for booking.

1. Load eligible orders with `GET /api/receptionist/orders?bookable=true`. The paginated results include order IDs and numbers and patient names. Eligible orders are pending, have at least one test item, and have no confirmed or checked-in appointment.
2. Send the selected order ID to `GET /api/appointment-slots`. Set `from` to midnight on the chosen date in `Asia/Jerusalem` and `to` to the following local midnight, both as RFC3339 timestamps. Display each returned slot's start, end, capacity, and remaining capacity.
3. Send `orderId` and `slotId` to `POST /api/appointments` with a UUID `Idempotency-Key`. Reuse the key when retrying the same submission. The saved appointment includes its IDs, slot times, local date, timezone, status, version, and timestamps. Display **Sample collection** as the fixed appointment label.

If eligibility or capacity changes before confirmation, refresh the order or slot selection after the corresponding conflict response.

## 1. Approved rules and UI coverage

The owner approved S3-APT-D01–D03 on 2026-10-29. The reviewed screenshot requires
booking, Upcoming/Past, date/time/status and Reschedule/Cancel. Responses also
expose appointment ID. No sample types, hours, appointments or clinical rules seeded.

- Timezone: **Asia/Jerusalem**, including DST. Store UTC instants. Input requires
  explicit RFC3339 offsets. Derive displayed date/time in the lab zone.
- ADMIN/RECEPTIONIST publish explicit non-overlapping slots;
  capacity is shared across all bookings. Half-open [start,end) intervals allow adjacency.
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
  Reschedule requires a still-PENDING order. Rebooking after
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
| POST /api/appointment-slots | ADMIN, RECEPTIONIST | Publish slot; 201. |
| PUT /api/appointment-slots/{id} | ADMIN, RECEPTIONIST | Replace capacity/active only; 200; immutable times. |
| GET /api/appointment-slots/schedule | ADMIN, RECEPTIONIST | Published schedule, including full/past; from/to/page/size and optional active=true/false. Omitted active includes both open and closed slots. |
| GET /api/appointment-slots | PATIENT, ADMIN, RECEPTIONIST | Bookable slots for required orderId/from/to; page/size. |
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

All appointments are laboratory visits. No appointment type input or lookup is required.

Slot create: {"startsAt":"2026-12-01T10:00:00+02:00","endsAt":"2026-12-01T10:30:00+02:00","capacity":2,"active":true}.
Valid offset timestamps require seconds and 0–6 fractional digits; no local-only time.
End > start; new start strictly future. capacity positive JSON integer within int
range; active required boolean. Update: {"capacity":3,"active":true}. Capacity cannot
fall below CONFIRMED occupancy. No time edits/deletion. Inactivation retains bookings.

Availability requires an accessible PENDING order with no active appointment,
and from/to. Alternatives derive order/owner from the eligible appointment. Only active future slots with capacity and no other active
patient booking appear. This is advisory; writes recheck under locks.

Slot queries require from/to offset timestamps, from < to, range <=31 days (technical
bound, not a booking horizon). Select startsAt >= from and < to. page=0, size=20 defaults;
digits only, page >=0 within int range, size 1–100. Sort slots by start asc/UUID asc,
Upcoming by start asc/UUID asc, Past by start desc/UUID asc.
Unknown tab/boolean, empty/repeated/unknown params, malformed/overflow inputs: 400.
No client patient/sort. Page fields: content,page,size,totalElements,totalPages,first,last.
Large JPA offsets return empty accurate-count pages without integer overflow.

Staff schedule filter (APT-SCHEDULE-01, 2026-11-09): only
`GET /api/appointment-slots/schedule` additionally accepts optional `active`.
Omission includes both states; exact `active=true` selects open slots and
`active=false` selects closed slots, based solely on the stored active flag.
This does not mean bookable/full/future: those properties do not change the
staff visibility rules. Blank, padded, differently cased, unknown and repeated
values (including identical repeats) return 400 VALIDATION_ERROR with
`fieldErrors.active` in the existing request-ID/no-store envelope.
The active predicate combines with the existing `[from,to)` start-time bounds
before pagination AND counting, including empty/large-offset pages. Existing
31-day range bound, page/size defaults/limits, startsAt/UUID ascending ordering,
DTOs and ADMIN/RECEPTIONIST-only access are preserved. This is a read without
side effects or new retry requirements. Patient availability and alternatives
do not accept this filter and retain their existing active-only rules.
Examples: append `&active=true` for open slots, `&active=false` for closed slots,
or omit it for both states on the staff schedule request below.

Task status: IN_PROGRESS; contract, implementation and three focused test cases
are added. Source/diff review and `git -c core.safecrlf=false diff --check` passed.
Test compilation/execution and Postman updates are explicitly deferred; no
historical passing run is evidence for this change.

## 4. Booking and representation

POST /api/appointments:

```json
{"orderId":"<order-uuid>","slotId":"<slot-uuid>"}
```

Exactly one canonical UUID Idempotency-Key required. Identity = (creator,key); intent
= original order/slot. Same intent returns existing ID/current state even after
move/cancel, without fresh availability checks, but rechecks current role/ownership.
Different intent: 409 IDEMPOTENCY_KEY_REUSED. Failed writes do not consume keys. New
keys intentionally book subject to all constraints. Patient Location on create/replay:
/api/appointments/me/{id}; no fabricated staff read URI.

Appointment fields: id,orderId,slotId,startsAt,endsAt (UTC),
timezone="Asia/Jerusalem",appointmentDate (YYYY-MM-DD),appointmentTime (HH:mm:ss with
fractions when present),utcOffset,status,version,canReschedule,canCancel,
actionIneligibilityReason,createdAt,updatedAt,cancelledAt,cancellationReason.
No demographics, staff account data or internal retry intent. Ineligibility reasons:
CANCELLED/STARTED, otherwise null; non-PENDING order gives ORDER_NOT_PENDING and disables
reschedule only (direct cancel remains time/status-based). Writes recheck eligibility.
Slot: id,startsAt,endsAt,capacity,remainingCapacity,active,timezone.
Remaining capacity counts all active appointments together.

## 5. Reschedule and cancel

Reschedule: {"slotId":"<target-slot-uuid>","expectedVersion":0}; expectedVersion required
nonnegative JSON integer within long range. Require CONFIRMED, now < old start, PENDING
order and active/future target with capacity/no patient overlap. Preserve ID/order/creation/retry intent. Retain old/new slot, actor/time and revision in
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
| 404 | APPOINTMENT_SLOT_NOT_FOUND | Missing management target. |
| 409 | ORDER_NOT_BOOKABLE | Order is not pending, has no test items, or has an active appointment. |
| 409 | APPOINTMENT_SLOT_UNAVAILABLE | Missing/inactive/past/full target or patient overlap. |
| 409 | APPOINTMENT_NOT_CHANGEABLE | Cancelled/started or reschedule order non-PENDING. |
| 409 | APPOINTMENT_CHANGED | Stale reschedule revision. |
| 409 | APPOINTMENT_SCHEDULE_CONFLICT | Slot overlap or capacity below occupancy. |
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
| Slots / ADMIN or RECEPTIONIST | POST /api/appointment-slots with `{"startsAt":"2030-01-15T10:00:00+02:00","endsAt":"2030-01-15T10:30:00+02:00","capacity":2,"active":true}` → 201; save slotA. Repeat with start 10:30/end 11:00 for slotB. Times must still be future and not overlap existing slots; choose another date if necessary. |
| Schedule / staff | GET /api/appointment-slots/schedule?from=2030-01-15T00:00:00Z&to=2030-01-16T00:00:00Z&page=0&size=20. PUT /api/appointment-slots/{slotA} with `{"capacity":3,"active":true}` → 200. |
| Order / PATIENT | Use an existing owned PENDING order or POST /api/orders/me with `{"testIds":["<active-test-uuid>"]}` and a fresh UUID Idempotency-Key; save returned orderId. No appointment/payment created by order creation. |
| Book / PATIENT or staff | POST /api/appointments with a fresh UUID Idempotency-Key and `{"orderId":"<orderId>","slotId":"<slotA>"}` → 201 CONFIRMED, version=0, action flags true; save appointmentId. Same body/key → 200 same ID. Different slot/same key → 409 IDEMPOTENCY_KEY_REUSED. |
| Lists/detail / PATIENT | GET /api/appointments/me?tab=UPCOMING&page=0&size=20; GET /api/appointments/me?tab=PAST&page=0&size=20; GET /api/appointments/me/{appointmentId}. Inspect ID/date/time/status/zone/offset/actions. Foreign patient detail →404. |
| Alternatives / owner or staff | GET /api/appointments/{appointmentId}/alternatives?from=2030-01-15T00:00:00Z&to=2030-01-16T00:00:00Z&page=0&size=20. Current/full/inactive/conflicting slots excluded. |
| Reschedule / owner or staff | POST /api/appointments/{appointmentId}/reschedule with `{"slotId":"<slotB>","expectedVersion":0}` →200, same ID, version=1. Exact immediate repeat →same version. Stale revision/different target →409. |
| Cancel / owner | POST /api/appointments/{appointmentId}/cancel with `{}` →200 CANCELLED, flags false; retained in PAST, order unchanged. Repeat preserves metadata. Staff require `{"reason":"Synthetic cancellation requested"}`. |
| Rebook/cascade | Rebook the PENDING order with a fresh UUID key. POST /api/orders/{orderId}/cancel with `{}` as patient (staff require reason) →both order and active appointment CANCELLED atomically; older cancelled rows unchanged. |

Negative checks: LAB_TECHNICIAN→403; foreign order/appointment→404; unknown/wrong-type
JSON, invalid/multiple booking key, malformed offsets, repeated/unknown query→400;
full/inactive target, duplicate active order/patient slot, overlapping publication,
capacity below occupancy→409. First direct change at/after start→409; linked
PENDING-order cancellation still cascades. Refresh availability/detail after conflict.
This is a manual handoff, not executed HTTP/Postman evidence or deployment validation.
# Admin Booking Slots mapping (2026-11-10)

The existing staff schedule active filter is already implemented and covered by
AppointmentScheduleTest. Reuse schedule/create/update as documented below;
booked=capacity-remainingCapacity and display status derives from active and
remainingCapacity. Deactivation preserves existing appointments. Edit changes
capacity/active only, not times. See [Admin screen mapping](ADMIN_ACTIVITY_API.md).
