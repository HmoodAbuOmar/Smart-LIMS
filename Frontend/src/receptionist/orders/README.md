# Receptionist Orders / R06

From `Frontend/`, run `npm run dev -- --port 5173 --strictPort`.

- List: `http://localhost:5173/#/__receptionist/orders`
- Workspace: `http://localhost:5173/#/__receptionist/orders?orderId=demo-patient-order-1`
- Create: Today → Walk-in → choose/create patient → profile → Create lab order. A confirmed save navigates directly to the returned order ID, with Items selected. No route load creates an order or appointment.

The Orders navigation item, patient-profile order actions, and creation flow use the same ID-based workspace and `walkInService` data. The creation form retains the selected patient, now showing file, name, DOB, gender and phone. Existing catalog prices, duplicate prevention and price/activity checks are preserved. Clear all is available alongside per-item removal.

## Confirmed backend boundaries

- `Backend/src/main/java/com/smartlims/orders/controller/OrderController.java` has staff POST `/api/orders`, but order GET/list/detail endpoints are only under `/api/orders/me` for patients. No staff GET endpoint is invented or called.
- `CreateStaffOrderRequest` accepts only patientId/testIds with a UUID Idempotency-Key. WALK_IN/source and notes are not in that contract. Those fields remain supported only by the existing development fixture path. Backend and authentication are unchanged.
- `OrderItemResponse` provides test ID/code/name and priceAtOrder, with no test-progress status. Item status is shown as Unavailable; it is never inferred from payments or order status. Existing historical fixture orders lack item snapshots entirely, so the workspace explicitly reports that absence instead of fabricating tests or historical prices.
- No staff payment-recording endpoint or Receptionist Record Payment flow exists. The payment tab reads existing linked fixture transactions; Record Payment is disabled with an explanation. The patient hosted-payment integration is not reused for staff collection.
- Existing fixture orders have date-only creation and no order type. The UI displays the available date and an unavailable type, without inventing a time or WALK_IN value. Newly created local orders carry their saved timestamps and WALK_IN type.
- Production `#/receptionist/orders` fails closed with the specific staff authentication/transport/API gaps. It does not expose local records or produce a success state. These previews are not live server saves.

## Data and refresh

The development-only shared order service reuses the same patient/order/appointment/transaction fixture relationships by internal IDs. Confirmed payment amounts minus confirmed refunds form Paid; Outstanding is max(Total − Paid, 0). Pending, failed and cancelled transactions are excluded. Balances stay separate from item progress.

Local patient and order services now optionally persist in sessionStorage (development wiring only), so newly created orders and new patient records survive refresh in the same tab. Stored orders retain immutable price snapshots and idempotency keys. Factory instances without the storage option remain isolated in memory for tests. Storage failures do not report successful creation. Loading, missing, empty, retry and unavailable states are provided.

## Checks

```text
npm run build
npm run lint
node src/receptionist/orders/check-orders-model.mjs
node src/receptionist/orders/check-orders-isolation.mjs
node src/receptionist/orders/check-orders-browser.mjs
node src/receptionist/patients/check-patients-model.mjs
node src/receptionist/patients/check-patients-browser.mjs
node src/receptionist/today/check-today-browser.mjs
```

The existing Walk-in browser-check command delegates to the Orders end-to-end check because the flow now ends in R06. Browser checks cover both existing/new-patient creation, changed prices/deactivation, retained failed drafts, repeat-click prevention, clear-all, existing transactions/refunds/appointments, order-ID reload without creation, four tabs, keyboard tabs, English/Arabic desktop/mobile, missing orders and production isolation. Browser checks use temporary Vite/preview servers and Chrome profiles; no API calls are made.

No attached mockup was available in the conversation; the supplied functional requirements and existing Smart-LIMS theme were used.
