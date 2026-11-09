# Patient-facing copy and confirmation safety

The interface uses professional Arabic and English wording without developer banners, fixture notices, or payment outcome controls. Laboratory specimen terminology (for example, “sample collection”) remains unchanged.

## Confirmation rules

- Unavailable operations show concise errors or neutral pending states. A pending checkout retains the selected tests, date, time, amount, and payment method but generates no booking reference, order, appointment, or payment success.
- Booking success requires an authoritative adapter response matched to the request, authenticated patient's file, selected tests, date/time, currency, and payment method. Online payment additionally requires verified payment status.
- The confirmed receipt uses the requested success wording and actual returned booking details. Retrying pending operations reuses the request identifier; backend idempotency remains required.
- Production registration/login navigation uses real authentication components. Vite development automatically connects normal authentication buttons to an isolated frontend flow with no accounts, sessions, or verification success. No testing links are rendered. Production excludes the frontend flow.

## Data boundaries

Production workspaces start empty when services are unavailable. The explicitly isolated Vite development portal loads the original project fixtures. Internal fixture records are excluded from production, clinical charts show empty states when no authorized data exists, and production reports require an authorized PDF response. Development-only sample exports use the original watermarked report generator. Fixtures and the browser component harness remain development-only; neither provides actual patient records or authentication. No medical data is persisted in browser storage.

## Backend integration

Existing `patientApi.js` and `portalApi.js` adapters currently reject unavailable operations. No endpoint was invented or backend file changed. Implement these adapters against agreed authenticated contracts, including authorization, payment-provider verification, booking idempotency, and authorized report download. `patientState.js` documents the frontend normalized booking response validation; this is an adapter contract, not a proposed HTTP endpoint.

## Checks

`npm run build`, `npm run lint`, and `npm run test:patient-facing` check compilation, copy, fixture isolation, pending-state behavior, verified receipt rendering, and duplicate-response handling. `npm run test:patient-facing:browser` additionally checks Arabic/English, responsive layouts, real authentication failure handling, pending checkout interactions, and protected routes. Browser checks require development and production-preview servers on ports 5173 and 4173. They do not establish that any real backend booking or payment has succeeded.
