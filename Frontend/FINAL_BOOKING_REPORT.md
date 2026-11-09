# Final booking and payment frontend

## Operational frontend behavior

- Existing catalog -> appointment selection -> review -> payment method -> final
  confirmation dialog -> receipt navigation remains connected in both languages.
- The final dialog shows patient name, selected tests, date/time, total in ILS,
  and payment method. Cancel returns to editing without submitting anything.
- Both methods use concise patient-facing descriptions. No card inputs, technical
  banners, development badge, or payment outcome controls are displayed.
- Existing success receipt uses the requested checkmark, Arabic/English wording,
  actual saved reference/name/tests/date/time/amount, separate booking/payment
  statuses, bookings navigation and patient-home action.
- A server-confirmed order/appointment pair is merged atomically into the portal
  state. Duplicate responses cannot create duplicate records. UI and transaction
  locks prevent repeated confirmation clicks. Retries preserve the request ID.
- Missing/unconfirmed operations remain pending, show concise real failure
  messages, and create no orders, appointments, payment success or reference ID.
- The isolated development workspace retains unfinished checkout choices and its
  page across refresh. Only fixture test IDs, date/time, method, request identifier
  and UI preferences are stored in the tab. No names, profile fields, clinical
  result values, credentials, card data or completed transaction proof is stored.
  Production continues to require authenticated backend loading and persistence.

The original fixture sources, catalog prices, orders, results, notifications,
medical visits, health charts, theme, styles, assets and real route guards are
unchanged. Local fixtures are not relabeled as newly processed live operations.

## Still blocked by integration

There is no booking/payment transport or payment provider configured in this
checkout. Existing `bookingApi.confirmPayAtLaboratory`,
`bookingApi.createHostedPayment` and `bookingApi.verifyPaymentAndBooking` reject
with SERVICE_UNAVAILABLE. No endpoint or provider contract was invented, and no
backend file was changed. Consequently neither method can currently produce a
verified live booking success. This is reported here rather than fabricated.

Backend work must implement authenticated patient-owned booking/order creation,
slot reservation and duplicate/idempotency checks, plus authorized workspace
loading. Lab-payment success must return a saved appointment and associated order
with pending payment. Online integration needs a hosted provider session and
server-side provider confirmation before a saved paid receipt is accepted. Session
creation alone cannot mean payment success. Provider secrets, raw card numbers
and CVV must never be handled by the application frontend or its storage.

The normalized frontend confirmation guard in `patientState.js` checks explicit
confirmation, matching request/patient/test/date/time/method, order association,
ILS totals, and verified online payment. It is an adapter boundary, not a guessed
HTTP endpoint. Durable production persistence and live end-to-end confirmation
still require those backend/provider integrations.

## Checks

- Build/lint, localization, booking model, and patient-facing safety tests.
- Success receipt rendering for both lab-pending and verified online-paid server
  response shapes, no success for cancelled/unverified records, atomic insertion
  and duplicate-response rejection. These use test inputs, not a live backend.
- Browser tests cover Arabic/English, multiple tests, dialogs/cancellation,
  unavailable lab/online requests, real errors, no fake success, retained pending
  details/request ID on refresh, original portal data, and protected production
  routes. Mobile/tablet/desktop layouts use the existing styles.
- Production build scan excludes the development flow, fixtures and persistence.

## Files changed

- `src/portal/booking/BookingFlow.jsx`, `bookingCopy.js`, `bookingModel.js`, `PatientPortal.jsx`
- `src/dev/DevelopmentPortal.jsx`, `portalWorkspace.js`, `PatientPreview.jsx`
- `scripts/check-patient-facing.mjs`, `check-patient-facing-browser.mjs`,
  `check-restored-data.mjs`, `check-development-preview.mjs`
- `DEVELOPMENT_PREVIEWS.md`, `RESTORED_PORTAL_DATA.md`, `FINAL_BOOKING_REPORT.md`

No commits, pushes, backend modifications, new dependencies or stylesheet changes.

## Hosted card-field enhancement

The Online Payment section now includes processor-owned field integration slots,
receipt email and an amount-bearing pay button. Card entry remains locked until a
reviewed processor adapter is configured; there are no custom React card inputs.
The backend/provider session, confirmation and verified booking sequence is
prepared. See `HOSTED_PAYMENT_INTEGRATION.md` for the current integration contract,
configuration still required, data boundaries and tests. Laboratory payment and
the previously restored data remain unchanged.
