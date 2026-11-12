# R05 — Create Walk-in Order

Start Vite from `Frontend/` with `npm run dev`. Open `http://localhost:5173/#/__receptionist/today` and choose **+ Walk-in**, or open `http://localhost:5173/#/__receptionist/walk-in` directly. The shared Receptionist layout/sidebar is unchanged; Today remains the active parent navigation item.

## Confirmed contracts and dependencies

- `Backend/src/main/java/com/smartlims/orders/controller/OrderController.java`: staff order creation is `POST /api/orders`, with `Idempotency-Key`. `OrderService.java` requires exactly one UUID key. The payload in `dto/CreateStaffOrderRequest.java` contains only `patientId` and `testIds` (1–100 unique UUIDs). **There is no WALK_IN/source or notes field.** Unknown fields are not invented or sent by the staff API adapter.
- `auth/security/SecurityConfiguration.java` and `orders/service/OrderCreationTransactions.java` permit ADMIN/RECEPTIONIST creation. The transaction validates active ILS tests and snapshots their current prices. It does not create an appointment or consume a slot. The creation response contains ID, order number, patient ID, items and totals.
- `labtests/controller/LabTestController.java`: `GET /api/lab-tests` and `GET /api/lab-tests/{id}`; Receptionists have read permission. `LabTestResponse.java` provides name, price, currency and active status. Frontend catalog fixtures supply paired names and integer `priceCents`; these are service-provided values, not prices entered by the receptionist.
- R02's existing patient service, search/pagination and Add patient drawer are reused. Add patient stays beside search in Walk-in mode. Existing records require explicit selection. A confirmed new-file save opens the same patient profile by its returned ID and shows Patient file created; search text is never treated as a name to prefill. Neither matching name nor phone selects, merges or links patient records.
- `services/serviceTransport.js` is unconfigured, and the production Receptionist entry still fails closed. The regular `#/receptionist/walk-in` route explains the missing staff access, transport and WALK_IN/notes contract. It never imports the development workspace or reports a created order. Backend/authentication were not changed.
- No Receptionist R06 screen or staff order-details route exists in this checkout. Patient-portal order details use patient permissions and are not reused for staff. After the local service confirms creation, R05 shows its returned number, immutable item prices and total, with an explicitly unavailable Open order action. R06 remains a dependency.
- No UI-guide PDF was present in this checkout; the implementation follows the supplied R05 functional requirements. Page 41 could not be inspected.

## Patient profile step (R04)

The Walk-in route owns three steps: R02 search, a shared ReceptionistPatientProfile component, and R05 order entry. Selecting an existing patient and creating a new file both open that profile with Orders selected. It reloads the record by ID, shows read-only account status and demographics, and provides Patient Details, Orders and Appointments tabs. Create lab order is always available after a successful profile load. Local order and appointment history reuses the existing Admin patient fixtures by stable patient ID; new orders come from the same R05 service store, filtered strictly by patient ID, and confirmed orders remain visible when returning to the profile. No standalone R04 route existed, so this is an embedded profile step on the existing Walk-in route, rather than a disconnected duplicate screen.

Patient lookup is supported by GET /api/patients/{id}; its current backend response lacks account-link status. Missing status stays unavailable. The backend has only patient-self order list/detail endpoints and no staff patient-order or patient-appointment listing endpoint. No endpoints are guessed. Live history remains unavailable rather than inventing staff endpoints. The preview uses the existing local R02 patient store, matching fixture histories and confirmed local R05 orders. These preview histories are not live saves.

## Preview behavior

The development-only order service uses the existing Admin catalog service and R02 patient store. Orders live in memory for the browser session. It does not import appointment/slot services. A confirmed local order has `source: 'WALK_IN'` and retains notes; neither is claimed to be supported by the live API.

Before confirming, R05 reloads service test definitions. Changed prices update the draft and require another confirmation. Missing/inactive tests remain visible for removal and block creation. The local save boundary checks prices/activity again. In a future live integration the current backend has no expected-price/version field, so guaranteeing unchanged prices between review and commit requires an agreed server contract.

Pending submissions lock mutable controls. Failure preserves patient, selection and notes, and retry reuses the same UUID key until the draft changes. Success requires an actual returned order ID/number, matching patient ID, items and total; it is never triggered by a button click alone.

## Checks (from Frontend)

```text
npm run build
npm run lint
node src/receptionist/walk-in/check-walk-in-model.mjs
node src/receptionist/walk-in/check-walk-in-isolation.mjs
node src/receptionist/walk-in/check-walk-in-browser.mjs
node src/receptionist/patients/check-patients-model.mjs
node src/receptionist/patients/check-patients-browser.mjs
node src/receptionist/today/check-today-browser.mjs
```

Browser checks use installed Chrome, temporary profiles and temporary Vite/production-preview servers. They make no API requests. The R05 check covers Today entry, both-script/file/phone patient search, explicit selection, new patient return, active/unique test selection/removal, changed prices and deactivation, failed drafts, duplicate blocking, retry keys, successful local orders in both languages, unchanged appointments, desktop/mobile, loading failure/retry and production unavailability. Screenshots are saved outside the repository.

## Separate feature commit scope

Include this folder and only the Walk-in changes in `src/App.jsx`, `src/dev/DevelopmentReceptionist.jsx`, `src/receptionist/today/ReceptionistToday.jsx`, `ReceptionistEntry.jsx`, `check-today-browser.mjs`, and the optional patient-selection integration in `src/receptionist/patients/ReceptionistPatients.jsx`. No dependency or backend changes.
