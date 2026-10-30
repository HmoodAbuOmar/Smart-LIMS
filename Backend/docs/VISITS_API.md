# Visits API Contract — Stage 4

Stage 5 additive patient reads: `GET /api/visits/me/archive`,
`GET /api/visits/me/archive/tests` and `GET /api/visits/me/archive/{id}`.
See [MEDICAL_HISTORY_API.md](MEDICAL_HISTORY_API.md) for completed visit archive
eligibility, search/date/test/stored-flag filters, paging and published details.
These stricter archive views do not change Stage 4's general visit list/detail
semantics or payloads; real specimen evidence associates archive publications.

Stage 4 DONE, 2026-10-30. Tasks 19–27; final isolated suite 319/319, zero failures/
errors/skips. Evidence: TESTING.md#stage-4-verification-2026-10-30. Exact manual
workflow: RESULTS_API.md#manual-http-verification. No deployment claim.
Reuse existing order/item, patient and appointment identities, no fabricated visits.

ADMIN/RECEPTIONIST record actual arrivals and administrative completions. Each
visit belongs to one order; order has many visits. Optional appointment must be
for that order, CONFIRMED and not linked to any prior visit. One visit per
appointment, including completed visits. Select nonempty distinct orderItemIds
explicitly for that visit (1–100), all from the same order. Starting a real visit
changes PENDING→IN_PROGRESS, or joins an already-IN_PROGRESS order. Reject CANCELLED/
COMPLETED. No arrival inferred from booking/time. Explicit arrivedAt must not be
future; no invented backfilled visits. Visit state OPEN→COMPLETED only.

| Method/path | Role | Behavior |
|---|---|---|
| POST /api/visits | ADMIN/RECEPTIONIST | {orderId,appointmentId nullable,orderItemIds,arrivedAt}; UUID Idempotency-Key; 201/200 exact replay. |
| GET /api/visits | ADMIN/RECEPTIONIST/LAB_TECHNICIAN | Minimal work list, optional orderId, page/size. Administrative detail only. |
| GET /api/visits/{id} | Same staff | Real administrative detail, no unpublished measurement values. |
| POST /api/visits/{id}/complete | ADMIN/RECEPTIONIST | {expectedVersion,completedAt}; actual time >=arrival, <=now; preserve repeat metadata. |
| GET /api/visits/me | PATIENT | Owned visit page, optional orderId; no arbitrary patientId. |
| GET /api/visits/me/{id} | PATIENT | Owned actual visit detail; unknown/foreign same 404. |
| POST /api/appointments/{id}/no-show | ADMIN/RECEPTIONIST | {expectedVersion}; only unvisited CONFIRMED at/after slot end; metadata retained. |

Arrival with an appointment atomically records CHECKED_IN, check-in actor/time and
real visit link. CONFIRMED and CHECKED_IN consume capacity and block another active
appointment for the order/patient slot. Direct patient/staff reschedule/cancel still
requires future CONFIRMED and applicable PENDING-order policy; CHECKED_IN cannot
be directly cancelled/rescheduled. Past tab remains all except future CONFIRMED.
Completing visit atomically marks its CHECKED_IN appointment COMPLETED, releasing
capacity. NO_SHOW releases capacity; repeats preserve first actor/time. No-show
and arrival serialize so an actually visited appointment cannot become NO_SHOW.
No direct arbitrary appointment status updates. Original creation retry still
returns the same appointment's current state, including visit states.

Administrative completion is independent of laboratory completion; it can precede
publication. Order completes only with current publications for every existing
order item and all visits closed, reconsidered on visit completion/publication.
All items currently required, no optional order-item flag. PENDING cancellation
still works; once arrival wins the order lock it becomes IN_PROGRESS and existing
cancellation returns 409, never partially cancels visits or received specimens.

Detail fields: id,visitNumber (server sequence VIS-…),orderId/orderNumber,status,
version,arrivedAt,completedAt,appointmentId nullable, patient-visible selected
test identities, order processing state, per-item PENDING/PUBLISHED status and
authorized current published result links. Include specimen IDs/status/type/
collection/receipt times without internal notes. Patients cannot read draft IDs/
values or internal notes. No fabricated payments or attendance. Lists page in
arrival descending/UUID ascending order; same 0/20 defaults and 1–100 size bounds
as RESULTS_API.md, strict known queries. Patient unlinked list→404 profile error;
foreign/missing detail→404 VISIT_NOT_FOUND.

Strict UUIDs/offset microsecond timestamps/JSON, unknown/repeated fields→400.
Conflicts: VISIT_STATE_CONFLICT, VISIT_CHANGED, APPOINTMENT_STATE_CONFLICT,
ORDER_NOT_PROCESSABLE, IDEMPOTENCY_KEY_REUSED. Preserve events and replay identity.
Transactions: order lock first, coordination/appointment/slot only if linked,
visit/item writes atomically; no reverse lock order, no clinical permission implied
by administrative visit authority. Fresh/upgrade, role/ownership, time/capacity,
arrival/no-show/cancellation and completion/publication races require focused tests.
