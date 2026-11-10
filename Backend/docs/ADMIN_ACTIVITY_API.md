# Admin activity screens

Contract established 2026-11-10 (ADM-ACT-01). All new routes below are read-only,
ADMIN-only, require an eligible current stored account, and return no-store JSON.
Existing JWT/cookie authentication and error envelope apply. No new payment,
refund, clinical publication, audit mutation or booking-time editing workflow.

## Screenshot mapping

| Screen | Fields/actions and sources |
|---|---|
| Booking_Slot.jpeg | Calendar selection/Today/month navigation are client controls. GET /api/appointment-slots/schedule takes RFC3339 from inclusive/to exclusive (maximum 31 days), page/size and optional active. For a Jerusalem day send that local midnight and the next local midnight with their actual offsets. Time=startsAt/endsAt in timezone; capacity=capacity; booked=capacity-remainingCapacity; available=remainingCapacity; status=!active ? Inactive : remainingCapacity==0 ? Fully booked : Available. POST /api/appointment-slots creates; PUT /api/appointment-slots/{id} updates capacity/active only. Existing bookings remain after deactivation. Existing active-filter implementation/tests reused. |
| Audit_log.jpeg | GET /api/audit-logs: timestamp=recordedAt (occurredAt also returned), actor=id/name snapshot, action=real event kind, entity=type/UUID, details=fixed safe description. Filters fromDate/toDate, actorId, action, search, page/size. Response includes actor/action options from retained events, totalElements and page metadata. |
| Operation and Payment.jpeg | GET /api/orders: orderNumber, patientId/patientName, historical test items (id/code/name/price), totalAmount, currency, status, createdAt. Filters fromDate/toDate, status, search, page/size. summary.totalOrders and summary.orderValue cover the entire filtered set, not just the page. Payment status and financial cards are explicitly unsupported. Transactions has no implemented source; no fake transaction endpoint. |
| Report.jpeg | GET /api/reports/operations: reporting period, ordersByStatus/testsByStatus with counts/shares, appointments scheduled/attended/noShow/cancelled/awaitingAttendance, rejectedSamples, financial summary and sourceDetails. Apply re-fetches; Source details uses returned definitions. Print belongs to the client; no additional print route. |

## Shared inputs and responses

Dates are strict ISO YYYY-MM-DD, inclusive calendar dates in Asia/Jerusalem,
translated to [local midnight, next-day midnight) including DST. Reversed,
malformed, blank or repeated dates return 400 VALIDATION_ERROR. Lists default to
all dates, page=0,size=20 (1..100), newest first then UUID descending. Unknown or
repeated query keys and invalid UUID/enum/paging values return the existing 400
envelope. Search is trimmed, maximum 150 characters, case-insensitive literal
substring (%, _ and backslash are literal). No side effects; safe to retry GETs.

GET /api/orders filters status=PENDING|IN_PROGRESS|COMPLETED|CANCELLED; search
matches order number, current patient name or historical item name, using EXISTS
so multiple matching items never duplicate orders/counts/totals. Order amounts
always sum retained price_at_order, including cancelled orders; they are historical
order value, never cash collected or an outstanding balance. Patient response
contains only ID/display name, no contact/health/account details.

Example: GET /api/orders?fromDate=2026-11-01&toDate=2026-11-10&status=PENDING&search=synthetic&page=0&size=8

GET /api/audit-logs filters actorId=UUID and exact action from the returned actions.
Recorded events: sample REGISTER/RECEIVE/ATTEST/REJECT; result CREATE/EDIT/
APPROVAL_INVALIDATED/APPROVE/PUBLISH/CORRECTION; visit ARRIVAL/COMPLETE;
appointment CHECK_IN/VISIT_COMPLETE/NO_SHOW. These are laboratory_events,
not a comprehensive general audit trail. User/catalog/slot configuration,
appointment booking/reschedule/cancellation, order creation/cancellation and
notification-template deletion are not recorded there. Screenshot sample events
are illustrative and are not manufactured. Filter options cover all retained
events independently of page/search/date. Unknown action returns 400; an unknown
well-formed actor UUID returns an empty list. Search covers entity type, entity
UUID and fixed safe details only. Never return/search free-text reasons, result
values, patient names, tokens, credentials, or arbitrary event payloads. Unknown
future kinds use a generic safe description. Display recordedAt in Jerusalem;
occurredAt is the workflow's effective timestamp, potentially backdated.

Example: GET /api/audit-logs?fromDate=2026-11-10&toDate=2026-11-10&action=REJECT&page=0&size=8

## Report metric definitions

Reporting fromDate/toDate default, when both omitted, to the last 30 Jerusalem
calendar days including today. A single supplied bound is open on the other side.
No paging inputs accepted. All queries within each response use a repeatable-read
snapshot. This is current recorded status for a selected cohort, not a historical
as-of reconstruction. Shares=100*count/cohort total, rounded to one decimal;
empty cohorts have real zero counts and zero shares. Rows include all four states.

- Orders: one test_orders row, cohort date created_at, current stored status.
  PENDING is the UI's New label.
- Tests: one order_items row, cohort date parent order.created_at (same order
  cohort). Cancelled parent => CANCELLED; current published result => COMPLETED;
  otherwise any visit-item membership or result version => IN_PROGRESS; otherwise
  PENDING. Correction drafts with a still-current publication remain COMPLETED.
  Count items, never result versions or catalog definitions. This derived reporting
  grouping does not change workflow states or publication authority.
- Scheduled: all non-cancelled appointment records whose current slot starts_at
  is in the period, including attended/no-show; not the number created in period.
  Attended=CHECKED_IN or COMPLETED; noShow=NO_SHOW; awaitingAttendance=CONFIRMED;
  cancelled=CANCELLED separately. No inferred no-show from elapsed time. Rescheduled
  appointments belong to their current slot, no double counting of move history.
- Rejected samples: samples.status=REJECTED by rejected_at; replacements are
  independent samples and do not remove the original rejection. No reason exposed.
- Financial: both screens reuse the same FinancialSummary.unsupported() contract:
  supported=false, currency=ILS, confirmedPayments/refunds/netConfirmedCollections/
  pendingPayments=null and a source explanation. Each order's paymentStatus=null.
  No payments/refunds table or transaction API exists in the active migrations;
  planned database designs are not live sources. A zero-price order is a real
  0.00 order value while these unsupported financial amounts remain null.

Example: GET /api/reports/operations?fromDate=2026-10-12&toDate=2026-11-10

Frontend inspection: the current AdminOrdersPage/AdminPaymentsPage use demo
state in Frontend/src/pages/admin/AdminOpsPages.jsx; that mock payment array is
not transaction evidence. The current frontend router/Admin pages contain no
Reports page or Print handler. Printing and integration with these new read
responses remain frontend work; no frontend file was changed for this task.

No schema change is needed. Existing immutable event/snapshot records and
booking locks/overlap/capacity rules remain authoritative. General audit event
expansion and all payment/refund work remain deferred.

## Changed-file manifest

- New: laboratory/controller/AdminActivityController.java;
  laboratory/dto/AdminActivityResponses.java and FinancialSummary.java;
  laboratory/repository/AdminActivityQueries.java;
  laboratory/service/AdminActivityService.java;
  orders/dto/AdminOrderPage.java; orders/service/AdminOrderReadService.java.
  All Java paths here are under src/main/java/com/smartlims/.
- Modified: auth/security/SecurityConfiguration.java;
  laboratory/exception/LaboratoryErrorHandler.java;
  orders/controller/OrderController.java; orders/exception/OrderErrorHandler.java.
- Tests: new src/test/java/com/smartlims/laboratory/AdminActivityTest.java and
  AdminPostmanVerification.java; updated orders/OrderCreationTest.java's exact
  route role assertion for the newly authorized Admin GET /api/orders only.
- Documentation: this contract, APPOINTMENTS_API.md, ORDERS_API.md,
  DATABASE_DESIGN.md, TESTING.md and local-only IMPLEMENTATION_PLAN.md.
- Existing ignored Postman directory: collection read-back, README.md,
  run-admin.cjs and sanitized admin-run-summary.json. No shared environment edits.
