# R02 — Receptionist Patients: Search and Add

Preview: `http://localhost:5173/#/__receptionist/patients` after running `npm run dev` from `Frontend/`. Today and Patients navigate through the existing Receptionist menu and consume the shared Receptionist layout and `WorkspaceSidebar`.

## Confirmed backend contracts

- `patients/controller/PatientController.java`: `GET /api/patients` and `POST /api/patients`.
- `patients/dto/PatientQueryRequest.java`: search, zero-based page, size and sort. R02 uses 8 rows, `createdAt,desc`, and the matching `totalElements`/`totalPages` response fields.
- `patients/specification/PatientSpecifications.java`: search covers full name, patient number and phone.
- `patients/dto/CreatePatientRequest.java`: `fullName` (required, max 120), `dateOfBirth` (required, not future), `gender` (required), `phoneNumber` (required, max 20), and optional `address` (max 500). File number and creator are system-generated and not sent by the form.
- `patients/entity/PatientGender.java`: `MALE`, `FEMALE`, `UNKNOWN` are all supported. No alternative gender values are sent.
- `auth/security/SecurityConfiguration.java`: Receptionists may list and create patients. Existing authentication/authorization and the verified account-linking workflow are unchanged.

### Integration gaps

The shared `services/serviceTransport.js` remains unconfigured. `patientsService.js` delegates the confirmed GET/POST contracts to that existing boundary; it does not invent an HTTP client, credentials or access-session response. The regular `#/receptionist/patients` entry therefore remains unavailable and does not expose patient data before staff access and transport are configured. Backend endpoints exist; live integration is not claimed.

`PatientResponse` and its list response do **not** expose a link flag or account ID. An absent link field is displayed as **Unavailable**, never inferred as Unlinked. The development records have explicit `linkedAccountId` values, which supply their read-only Linked/Unlinked badges. A future staff API needs an authorized account-link indicator for live badges.

## Local preview behavior

The development service loads only behind Vite's development boundary. It reuses the existing 14 bilingual Admin patient fixtures, cloning them into an R02 session store; no Admin records are mutated and the two local services are not asserted to be a shared backend. New records have stable unique IDs and generated `PAT-` file numbers. Matching names or shared phones never merge records, choose an identity, or link an account. New names are stored as entered, without automatic translation or filling a second language value.

Search matches name variants, file number and phone, resets pagination, and uses the actual matching total. Saves wait for a returned patient ID and medical file number before showing success or closing the drawer. Failure retains entered values and focuses a relevant validation field. The current search is preserved when the list reloads after saving. Reloading the browser resets the local preview store.

Phone validation is the existing onboarding rule (7–15 digits with supported phone punctuation), extracted without behavior changes as `patientPhoneError`, plus the confirmed backend 20-character limit. Leading zeroes and `+` are retained as text. Date validation uses the existing application scheduling zone, `Asia/Jerusalem`.

The drawer uses native modal focus containment, Escape when idle, close/cancel without saving, and return focus to Add patient. It stays on the right in English, left in Arabic and fills narrow screens. During a save the form and close controls are disabled to avoid duplicate or uncertain submissions. The linking notice is informational; there is no linking action.

## Verification

Run from `Frontend/`:

```text
npm run build
npm run lint
node src/receptionist/patients/check-patients-model.mjs
node src/receptionist/patients/check-birth-date-model.mjs
node src/receptionist/patients/check-patients-isolation.mjs
node src/receptionist/patients/check-patients-browser.mjs
node src/receptionist/today/check-today-browser.mjs
node src/components/check-role-sidebars-browser.mjs
```

Browser checks use installed Chrome (or `CHROME_PATH`), temporary Vite/production-preview servers, and temporary profiles/screenshots outside the repository. They cover bilingual/name/file/phone searches, pagination and exact totals, validation, pending duplicate protection, failed save with retained input, confirmed local save and filtered refresh, focus/Escape, empty/error/retry states, missing account-link information, both drawer edges, mobile scrolling, language changes without losing form input, and production isolation. They make no API requests.

## Separate commit scope

The Add patient drawer uses an initially unselected required gender radio group (`MALE`, `FEMALE`, `UNKNOWN`, all supported by the backend enum). Birth dates accept DD/MM/YYYY keyboard entry, including Arabic digits, with a compact calendar providing direct month/year navigation. Valid dates are kept as date-only YYYY-MM-DD strings for submission, without local-time conversion. The appointment calendar cannot be reused because its future-date and weekday restrictions are inappropriate for birth dates; this picker follows its visual styling without changing that component.

Include this folder; `components/ReceptionistLayout.jsx`; Receptionist sidebar, development-entry and App route wiring; the minimal Today shell extraction and unavailable-entry text; the shared phone helper extraction in `services/onboarding.js`; and the two existing sidebar/Today check assertions updated because Patients is now an enabled navigation item. No backend, authentication, Admin data/style, or shared sidebar-design changes belong to R02.
