# R07 — Receptionist Appointments

From `Frontend/`, run `npm run dev -- --port 5173 --strictPort`, then open:

`http://localhost:5173/#/__receptionist/appointments`

The shared Receptionist sidebar enables Appointments. The daily table defaults to today in `Asia/Jerusalem`, filters by status and links orders by ID. Booked/capacity counts include BOOKED and CHECKED_IN, never cancelled/no-show entries. English/Arabic and desktop/mobile are supported.

## Confirmed backend contracts

- `appointments/controller/AppointmentController.java`: POST `/api/appointments` takes orderId, typeId and slotId plus a UUID Idempotency-Key. GET `/api/appointment-slots` takes order/type/date-range filters. GET `/api/appointments/{id}/alternatives` provides reschedule availability. POST `/api/appointments/{id}/reschedule` takes slotId and expectedVersion. POST `/api/appointments/{id}/cancel` takes reason; the backend requires it for staff, up to 1000 characters.
- `appointments/controller/AppointmentScheduleController.java`: GET `/api/appointment-types` and staff GET `/api/appointment-slots/schedule`. The latter returns slots/capacity, not the daily patient appointment list.
- `visits/controller/VisitController.java` and `VisitRequests.Arrival`: check-in uses POST `/api/visits` with orderId, appointmentId, orderItemIds and arrivedAt. No invented check-in endpoint is used.
- `AppointmentActionService`: move/cancel require a future CONFIRMED appointment. Move additionally requires a PENDING order and expected version. A move changes the appointment's slot relationship; it never edits a slot time. Capacity and patient overlap are checked again at confirmation.
- Backend CONFIRMED is the display BOOKED status already used by Today. `appointmentsModel.displayStatus` records this explicit mapping. Check-in eligibility continues to use Today's existing rules.
- Staff action permissions are already defined in `auth/security/SecurityConfiguration.java`. No authentication or backend files were changed.
- There is **no staff daily appointment-list endpoint**; GET `/api/appointments/me` is patient-self access. Frontend staff transport remains unconfigured. Production `#/receptionist/appointments` shows the specific unavailable state and never reports a successful action.

## Reuse and local consistency

R01 and R07 share one development-only appointment store behind `todayService`. Booking, moving, cancelling and check-in persist in same-tab session storage. The original Today fixture IDs and data are preserved; shared-store metadata supplies slot relationships and capacities. The store rechecks remaining capacity after asynchronous confirmation, so two requests for the last place cannot both commit. Invalid/version-conflict/failed actions retain their prior records.

The staff editor follows the existing slot-button picker pattern and reuses the Admin Booking Slots **pure** occupancy/timezone conversion helpers. The portal picker requires patient context and has hardcoded local times/weekday rules, so importing it into staff booking would give incorrect availability. Admin slot CRUD and patient-portal state remain unchanged. The preview exposes one collection type and generated fixture slots, not a live laboratory schedule.

Booking requires an explicitly chosen pending order with test items and no active appointment. If none exists, the editor points to the unchanged Today/Walk-in lab-order flow. Full/past/inactive/current slots cannot be selected. A stale full-slot response preserves the draft, refreshes capacity, and requires another available selection.

Order options use the shared order service and patient lookup by ID, displaying `Order number — Patient name` in the selected language. The original fixtures do not contain pending orders with item snapshots; they are not silently reclassified as bookable. Loading, failed order loading (with Retry), and an actual empty eligible list have separate states. Eligibility recognizes BOOKED/CONFIRMED/CHECKED_IN as active. Order Workspace → Appointment → Create booking opens `#/__receptionist/appointments?orderId=...`; that ID is preselected only after eligibility is confirmed. An unavailable requested order is never replaced with an automatically selected alternative.

Appointment cancellation only changes the appointment. The order remains intact. Order Details now exposes the existing order-cancellation contract for pending local orders: a reason is required, and its shared cancellation service cascades to the booked appointment. This mirrors `orders/service/OrderCancellationService` and `appointments/service/AppointmentOrderCancellation` (one backend transaction). The preview rolls back shared appointment changes if the order write fails and blocks stale booking attempts after order cancellation; production does not simulate this transaction.

Order Workspace reads the shared appointments. R01 fixtures have only order references: the workspace can open those exact IDs and patient records, while absent totals/status/type/item/payment details remain unavailable. It does not fabricate values or merge patients by name/phone. Newly created Walk-in orders retain full existing snapshots and balances.

No attached mockup or guide PDF was available for inspection; the supplied functional requirements and existing Smart-LIMS theme were followed.

## Checks

```text
npm run build
npm run lint
node src/receptionist/appointments/check-appointments-model.mjs
node src/receptionist/appointments/check-appointments-isolation.mjs
node src/receptionist/appointments/check-appointments-browser.mjs
node src/receptionist/today/check-today-model.mjs
node src/receptionist/today/check-today-browser.mjs
node src/receptionist/orders/check-orders-model.mjs
node src/receptionist/orders/check-orders-browser.mjs
node src/receptionist/patients/check-patients-browser.mjs
```

Browser checks use temporary Vite/preview servers and Chrome profiles. They cover daily/status filters, booking through a Walk-in order, a slot filling between selection and confirmation, rescheduling without slot-time edits, cancellation reason/order preservation, order-cancel cascade, two-way Today synchronization, linked-order navigation, dialog Escape, EN/AR desktop/mobile hover/focus and production unavailability. No live API or database calls are made.
