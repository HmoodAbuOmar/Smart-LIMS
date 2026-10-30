# Hosted payment integration

This guide describes the existing interfaces in [hostedPayment.js](src/services/hostedPayment.js), [HostedCardForm.jsx](src/portal/HostedCardForm.jsx), [PaymentMethod.jsx](src/portal/pages/PaymentMethod.jsx), and [PatientPortal.jsx](src/portal/PatientPortal.jsx). It does not select a processor, invent endpoints, or claim card processing is operational.

## Current behavior

Online Payment displays cardholder, number, expiry and CVC containers, Visa/Mastercard labels, receipt email and an amount-bearing pay button. Card containers are integration slots, not custom React card inputs. Receipt email is prefilled from the profile when available and remains temporary component state.

No provider is currently configured. `mountHostedPaymentFields` then returns `null`, so payment cannot pass hosted-field validation or produce a paid receipt. Attempting the operation shows a concise unavailable message. Pay at Laboratory retains its separate dialog/service path; its backend adapter is also unavailable and cannot confirm a saved booking locally.

## Processor adapter

A reviewed application bootstrap can call `configureHostedPaymentProvider(adapter)`. No URL parameter, storage flag or patient input configures a processor. The current interface requires:

| Member | Contract |
| --- | --- |
| `frameOrigins` | Explicit allowed HTTPS processor origins, as exact origins without paths. |
| `mount({ containers, locale, signal })` | Mount provider-owned hosted fields into `cardholder`, `number`, `expiry` and `cvc` containers, then return a ready controller. |
| `controller.validate()` | Return a boolean, not card values. Formatting, brand detection, masking and field errors stay in provider fields. |
| `controller.confirm({ session })` | Perform processor confirmation/authentication and return `{ paymentReference }`, an opaque reference. |
| `controller.destroy()` | Clean up fields/listeners on unmount or locale change. |

The wrapper inspects containers for HTTPS, cross-origin, allowlisted iframes and rejects ordinary input/textarea/contenteditable fields inside them. Controllers must expose `validate`, `confirm` and `destroy`; aborted mounts are cleaned up. These safeguards are not PCI compliance certification. Provider selection and actual SDK integration still require security review.

Use provider controls for number formatting, MM/YY validation, masking and permitted reveal behavior. Do not replace slots with raw card-data inputs. If the processor requires a single hosted checkout instead, agree that adapter separately; no SDK/provider is assumed here.

## Confirmation sequence

1. The patient selects Online Payment and supplies receipt email and provider-hosted details.
2. The frontend validates email and asks the hosted controller to validate fields. Without a provider it cannot proceed.
3. The existing final review dialog shows booking details. Cancellation starts no payment.
4. After confirmation, `processHostedPayment` calls `bookingApi.createHostedPayment` with the intent and trimmed receipt email.
5. The returned session needs a nonempty string `id`, `currency: 'ILS'` and the expected displayed online amount before processor confirmation is attempted.
6. The hosted controller confirms the session. Only its opaque reference is forwarded with session ID and intent to `bookingApi.verifyPaymentAndBooking`.
7. Server-side provider verification and atomic booking/order persistence must precede success. The frontend checks response currency/totals, then `verifiedBookingResponse()` checks patient/request/test/date/time/method, association and verified payment status before accepting records.

A redirect, browser SDK flag or session creation is not final payment proof. A final successful receipt requires accepted server-confirmed records; missing/unconfirmed operations remain pending/error states. No development approval control replaces actual payment in the current checkout.

## Backend and data handling

Booking methods in [portalApi.js](src/services/portalApi.js) reject with `SERVICE_UNAVAILABLE`. Their current normalized expectations are described in [API requirements](PATIENT_API_REQUIREMENTS.md). Agree transport contracts, secure sessions/ownership, server pricing, reservation, idempotency, provider sessions, webhook/transaction verification, failure/expiry handling and authorized retrieval.

Card number/CVC values are not read into React state, callbacks, logs, storage or application payloads. React holds readiness, validation state and receipt email. Provider session/reference data stays transient; only opaque reference and session ID cross into server verification. Locale changes destroy/remount fields instead of copying card values. Merchant secrets belong on the server. Public SDK configuration and CSP/HTTPS settings need provider-specific review.

Laboratory payment collects no card information. Its saved appointment must keep appointment status separate from payment status, with payment pending. Neither method can currently be verified end-to-end through unavailable adapters.

## Checks and limits

From `Frontend`:

```sh
npm run test:hosted-payment
npm run test:booking
npm run test:patient-facing
npm run test:patient-facing:browser
```

The browser suite requires Chrome and DEV/production servers on `localhost:5173` and `localhost:4173`. Test adapters exercise email/field validation, iframe origins, cleanup, opaque references, session -> processor -> server ordering, failures and quote mismatches. Browser checks cover unconfigured online payment and the pending laboratory path. These are not live transactions, settlement tests or proof of durable booking persistence.
