# Connected test booking and payment frontend

## Patient journey

The existing catalog and test details Add to Order actions now add a unique test
and open Book Appointment. Add More Tests / Back to Tests returns to the existing
catalog without losing the cart, appointment date/time/type, or payment choice.
Changing the date clears the previous time selection. Prices use the shared ILS
formatter; numerical prices are unchanged.

Book Appointment shows the selected tests/prices/total, calendar, available sample
slots, and the selected date/time. Continue validates these and opens a confirmation
dialog. Edit Appointment dismisses the dialog without creating records. Confirm
Appointment marks only the draft as reviewed and navigates to Payment Method.

Payment offers Visa/Mastercard online or payment at the laboratory. Each requires
a final confirmation dialog with the exact selected tests, total, date, and time.
Online confirmation also shows the amount in its heading. Errors leave the draft
and cart intact for retry, editing, or switching payment methods.

Final development completion atomically inserts a linked sample appointment and
order, clears the cart, creates an appointment notification, and opens the dedicated
confirmation page. The receipt shows the snapshot patient name, generated sample
reference, selected tests/count, date/time, total, method, and payment status. It
links to My Appointments, booking details, My Orders, and Dashboard. My Appointments
includes a details action for these bookings. Rescheduling preserves their tests,
order association, and payment metadata.

## Routes

Existing protected `#/patient/book` now reviews a selection; `?reschedule=:id`
continues to use the existing rescheduling form. New protected routes:

- `#/patient/payment`
- `#/patient/booking-confirmation/:bookingId`
- `#/patient/appointments/:bookingId`

All use the existing patient access guard. Unknown identifiers or opening payment
without a reviewed selection show a safe return action. Development uses the same
components in the existing isolated `#/__portal/` workspace (or normal onboarding
walkthrough). No authentication session is created or changed.

## Development and payment safety

There is no configured booking transport or payment provider in this checkout.
No real laboratory reservation or financial transaction is performed or claimed.
The related flow screens explicitly identify development bookings.

`src/dev/bookingSimulator.js` is imported only inside `import.meta.env.DEV`.
Online mode exposes a clearly labeled simulator response: approved, declined, or
connection failure. Approval records `simulatedPaid`, never a genuine `paid`
status. At-laboratory payment records `pending` and method `laboratory`. Success
copy explicitly says that no real booking/charge occurred. No PAN/card number,
expiry, CVV, provider token, or card-entry form exists in this frontend.

The draft, cart, receipts, and records exist in React state only. No new browser
storage or fake API requests were introduced. Reload/logout discards development
state. The only existing stored preference remains interface language.

The state machine is editing -> reviewed -> processing -> complete. Failures return
to reviewed. Review/cancel never creates an appointment. Processing locks draft
and cart changes; synchronous submit guards prevent rapid double clicks. Completion
requires a matching request ID and approved development receipt, and ignores repeat
completion. Related orders are reused only when the selected test set matches
exactly. No selected tests are silently appended to an existing order. Date, time,
test identifiers, and totals are checked again before completion.

## Required real backend integration

The existing authentication/verification/patient-file transport remains unavailable.
Production routes fail closed and never fall back to the simulator. New rejecting
frontend boundaries in `src/services/portalApi.js` are:

1. `bookingApi.createHostedPayment`: create an authenticated, patient-owned booking
   intent and hosted payment session, with server-calculated totals in ILS and a
   validated gateway redirect/hosted URL. No final URL or payload is invented here.
2. `bookingApi.verifyPaymentAndBooking`: retrieve server-confirmed payment and
   booking state. Provider redirects, frontend callbacks, or query parameters must
   never constitute payment proof. The backend must verify provider webhooks or
   transaction status and associate the paid order/appointment atomically.
3. `bookingApi.confirmPayAtLaboratory`: atomically validate availability and owned
   selected tests, create/reuse the order, and create the appointment with pending
   payment. Return authoritative identifiers, amount, currency, and payment status.

The backend must provide server availability/timezone rules, duplicate/idempotency
handling per booking intent, ownership checks, authenticated read APIs, conflict
errors, and payment status reconciliation. Do not trust client totals or sample
receipts. Confirm the request/response contracts before replacing the rejecting
methods. The production branch in `finishBooking()` deliberately refuses to
manufacture a confirmed record from an unspecified response. Real provider
integration and verified online payment success are not implemented or tested.

## Files changed

Created: `src/portal/BookingFlow.jsx`, `BookingFlow.css`, `bookingModel.js`,
`bookingCopy.js`; `src/dev/bookingSimulator.js`; `scripts/check-booking-model.mjs`,
`check-booking-flow.mjs`; this document.

Updated: `src/portal/PatientPortal.jsx`, `portalModel.js`, `portalCopy.js`;
`src/services/portalApi.js`; `src/App.jsx`; `scripts/check-patient-portal.mjs`,
`check-preview-build.mjs`; `package.json` (test scripts only).

## Checks

Validated on 2026-10-26: build and lint passed; booking/portal/currency/authentication/
localization/access-policy tests passed; production development-code exclusion
passed. The connected booking browser suite, all-12-page portal regression suite,
and original authentication/onboarding browser suite passed. EN/AR layouts were
tested at 320/768/1440px and representative booking/payment/receipt screenshots
were visually inspected. No real payment provider or server reservation was tested.

From Frontend:

```text
npm.cmd run build
npm.cmd run lint
npm.cmd run test:booking
npm.cmd run test:portal
node scripts/check-currency.mjs
npm.cmd run test:auth
npm.cmd run test:i18n
node scripts/check-registration.mjs
node scripts/check-preview-build.mjs
```

With dev running on 5173 and production preview on 4173:

```text
npm.cmd run test:booking:browser
npm.cmd run test:portal:browser
node scripts/check-development-preview.mjs
```

The booking browser test covers multiple tests, automatic navigation, date/time
changes, draft/back navigation, cancelling both dialogs, pay-at-laboratory, online
decline/retry/approval, connection failure with laboratory fallback, receipt details,
associated orders/appointments, double-submit protection, no card fields or sensitive
storage/API POSTs, real route guards, EN/AR and 320/768/1440px layouts. Screenshots
can be captured with `AUTH_TEST_SCREENSHOTS=1`. Actual server/payment operations
remain unverified because no provider or backend transport exists.
