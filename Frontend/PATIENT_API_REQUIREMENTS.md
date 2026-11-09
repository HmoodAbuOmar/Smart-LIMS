# Frontend API integration requirements

This document describes interfaces and checks in the current Smart-LIMS frontend. It does not define database schemas, claim backend endpoints exist, or prescribe final HTTP routes. Backend source and deployment availability were not inspected for this documentation update.

## Current boundary

- `src/auth/api.js` exposes account/session operations through `src/services/serviceTransport.js`.
- `src/services/patientApi.js` preserves the account facade and adds patient-file operations.
- `src/services/portalApi.js` declares workspace/profile/order/appointment/report/logout operations and payment/booking operations through `bookingApi`.
- The current transport and portal methods reject with `SERVICE_UNAVAILABLE`; no HTTP request implementation is configured there.
- `src/services/hostedPayment.js` supplies processor-adapter interfaces, but no processor is configured by application bootstrap.

Real accounts, email verification, sessions, patient records, verified linking, booking persistence and payments therefore require integration. UI validation, route guards, test response objects and DEV fixtures are not backend operations or evidence of success.

## Account and email interfaces

These are frontend method names and normalized expectations, not endpoint URLs. Map requests/responses at the existing boundaries after agreeing actual backend contracts.

| Method | Current input | Frontend expectation |
| --- | --- | --- |
| `authApi.registerAccount` | `{ fullName, email, password }` | Transition only for `{ accountCreated: true, verificationEmailSent: true, verificationId }` with a nonempty string ID. No medical demographics are collected here. |
| `authApi.login` | `{ email, password }` | Establish the real session; Login then calls `getAccess`. Submit success alone does not open patient data. |
| `authApi.getAccess` | Options, including optional abort signal | Internally maps to `patientAccess`. Supply authoritative `{ authenticated, userId, role, emailVerified, hasLinkedMedicalFile }`. Unknown role/file status does not produce a patient destination. |
| `authApi.verifyEmail` | `{ token }` | Normalize `status` to `pending`, `verified`, `expired` or `invalid`. Backend checks purpose, expiry and account binding. |
| `authApi.verificationStatus` | `{ verificationId }` | Return scoped challenge status, not public arbitrary-email account lookup. |
| `authApi.resendVerification` | Available `{ email, verificationId }` context | `emailSent: true` is required before claiming dispatch or starting cooldown. Optional `retryAfterSeconds` is bounded to 60-300 by the UI. |
| `authApi.requestPasswordReset` | `{ email }` | `accepted: true` enables the enumeration-safe accepted message. Mail delivery/rate limits remain server responsibilities. |
| `authApi.resetPassword` | `{ token, password }` | Require `passwordReset: true` before success. Enforce token lifetime/single use and password policy server-side. |

Confirmation passwords are UI-only. `emailFlow.js` reads link tokens and removes them from the URL; tokens are not persisted. Verification can accept valid returned `email` and `verificationId` context for subsequent actions. Refresh without recipient/challenge context must not fabricate one.

Recognized UI error codes include `INVALID_CREDENTIALS`, `RATE_LIMITED`, `EMAIL_NOT_VERIFIED`, `TOKEN_EXPIRED`, `TOKEN_INVALID` and `SESSION_EXPIRED`. Map agreed transport errors to those codes where appropriate; do not render raw server exception messages.

## Patient medical files

A user account and patient medical file are separate. `PatientOnboarding.jsx` checks access before showing production file screens. Creation/linking requires confirmation followed by a fresh access check resolving to the patient Dashboard.

| Method | Current mapped input | Required confirmation |
| --- | --- | --- |
| `patientApi.createFile` | `{ fullName, phoneNumber, dateOfBirth, gender }` | `fileCreated === true`, then verified linked-file access. |
| `patientApi.linkFile` | `{ fileIdentifier }` | `verifiedLink === true`, then verified linked-file access. This flag must represent backend ownership verification. |

Creation fields are the existing frontend draft, not a verified database schema. UI validation requires name, phone, a valid birth date between 1900-01-01 and today, and `male` or `female`. Agree additional mandatory fields and identifiers against the actual backend schema before adding UI/payload fields.

The linking form only collects an identifier; it cannot prove ownership. A secure challenge process and any additional identity controls must follow the backend's agreed contract. Never link solely on an unverified file number, name or phone, or expose private patient lookup data while establishing ownership.

Creation drafts stay in memory, scoped by stable server `userId`, and clear when leaving onboarding or ownership context fails/changes. Linking identifiers are form-local. These drafts do not persist production records.

## Portal and record ownership

`PortalEntry.jsx` first requires an authenticated, verified-email, linked-patient destination, then calls `portalApi.loadWorkspace`. Failures do not fall back to samples.

The workspace consumed by `PatientPortal.jsx` contains `profile`, `tests`, `cart`, `orders`, `appointments`, `results` and `notifications`. `profile.fileNumber` is the current patient identifier in frontend checks; agree its mapping to a real stable backend identifier. Test IDs and order/appointment/result associations must be consistent. This is a frontend view model, not a database schema.

Declared portal methods:

- `loadWorkspace`, `saveProfile`, `createOrder`.
- `bookAppointment`, `rescheduleAppointment`, `cancelAppointment`.
- `readNotifications`, `downloadReport`, `logout`.

The shared production mutation handler passes UI action objects into selected adapters. Translate them into agreed transport DTOs instead of treating UI actions as a final HTTP contract. It requires `confirmed === true`; profile responses must retain the current `fileNumber`, and order/appointment responses need valid non-fixture records associated with that patient.

`readNotifications` is declared, but the current notifications page dispatches local read/unread changes. Durable notification state requires explicit frontend wiring as well as backend implementation. Normal new-booking checkout uses `bookingApi`, not the generic `bookAppointment` boundary.

Production report download expects an authorized PDF `Blob` with type `application/pdf`. DEV reports use a separate guarded, watermarked exporter and are not clinical reports. Publication and archive eligibility checks are presentation safeguards; the server must enforce publication, ownership and authorization on every read/download.

The archive derives visits from completed appointments and verified published results associated with the patient. Biomarker series are separated by analyte, units and method. Do not manufacture measurements or silently convert incompatible results.

## Booking and payment

The current checkout intent contains `requestId`, selected test IDs, date, time, payment `method`, appointment `type` and optional `orderId`. It is an adapter input, not an endpoint or trusted price/reservation.

| Boundary | Expected role |
| --- | --- |
| `bookingApi.confirmPayAtLaboratory` | Validate the owned intent/availability, atomically save or reuse order and appointment, and return pending payment status. |
| `bookingApi.createHostedPayment` | Create an authorized provider session with a nonempty `id`, `amount` matching the reviewed online amount, and `currency: 'ILS'`. Session creation is not payment success. |
| `bookingApi.verifyPaymentAndBooking` | Receive intent plus `paymentSessionId` and opaque `paymentReference`; verify the provider transaction server-side and persist booking/order before confirming. |

`verifiedBookingResponse()` checks explicit confirmation, matching request/patient/test/date/time/method, order association, consistent nonnegative order/appointment totals and ILS currency. Online confirmation also needs `paymentVerified === true` and appointment `paymentStatus === 'paid'`; laboratory payment needs `paymentStatus === 'pending'`. The backend calculates authoritative prices and validates all IDs and availability independently.

Missing/unconfirmed/unavailable operations retain pending/error state without inventing references, orders, appointments or paid status. Client locks and duplicate-response guards complement server idempotency; they cannot replace it. `BOOKING_CONFLICT` and `PAYMENT_DECLINED` have existing checkout error handling.

See [hosted payment integration](HOSTED_PAYMENT_INTEGRATION.md) for the processor lifecycle. Card numbers/CVC must not become application payloads or browser storage. Provider secrets and transaction verification belong on the server.

## Required decisions and acceptance

Agree actual routes, DTOs, session transport/expiry, role mapping, authorization, CSRF/CORS rules where applicable, errors, patient schema/linking challenges, laboratory timezone/availability, pricing, booking idempotency, PDF delivery, notification persistence and provider/webhook verification. These interfaces do not supply an API base URL or session implementation.

End-to-end acceptance must exercise real registration/mail delivery/verification, recovery, returning-patient routing, secure creation/linking, owned workspace/report access, booking persistence/conflicts, provider failures and verified payments, duplicate requests, logout and expiry. Frontend tests cover controls and boundaries; they do not certify deployed operations.

Source references: [auth API](src/auth/api.js), [access policy](src/auth/access.js), [transport](src/services/serviceTransport.js), [patient facade](src/services/patientApi.js), [onboarding](src/services/onboarding.js), [portal APIs](src/services/portalApi.js), [portal state](src/portal/patientState.js), [portal entry](src/portal/PortalEntry.jsx).
