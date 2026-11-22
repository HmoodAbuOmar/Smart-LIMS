# Smart-LIMS registration contract

The administrative listing, invitations and account-action contract is now in
[USERS_API.md](USERS_API.md). Its additive page/bulk endpoints preserve the
existing users array and authentication response shapes. Successful login in
either mode records nullable lastLoginAt; failures and authenticated reads do not.

Security remediation F1: administrative `/api/users` operations retain their
existing HTTP contract and also require a currently eligible persisted ADMIN
at the service boundary. Anonymous, missing or ineligible callers receive
401 `UNAUTHORIZED`; callers without administrative authority or a current stored
ADMIN role receive 403 `FORBIDDEN`. Authorization precedes target access and
database/token/email changes. The non-web first-administrator command and public
token-authorized invitation acceptance retain their existing behavior.

Traceability: R-AUTH-01/02, R-NFR-01; T-AUTH-01/02 are historical references to the currently absent local implementation index. This document specifies registration; users/invitation contracts live in USERS_API.md. Detailed login/recovery behavior remains in the local [authentication requirements](../AUTH_REQUIREMENTS.md). Deleted planning/history files have not been recreated.

`POST /api/auth/register` accepts `Content-Type: application/json` with these required fields:

```json
{
  "fullName": "Example Patient",
  "email": "patient@example.invalid",
  "password": "example-passphrase",
  "confirmPassword": "example-passphrase"
}
```

- `fullName`: nonblank, 3–80 characters, stored on the user account after trimming.
- `email`: valid email, at most 120 characters after trimming; canonicalized using the existing email rules.
- `password`: the existing 8–100 Unicode-character policy, without additional composition rules.
- `confirmPassword`: required and must exactly equal `password`, including case and whitespace. Neither password input is trimmed. Confirmation is used only for validation; it is never persisted, logged, included in responses, or sent by email. Both password values are redacted from the request DTO's string representation.

`userName` and `phoneNumber` are not public registration fields. The existing strict JSON configuration rejects them as unknown properties with HTTP 400 `INVALID_JSON`. They are stored as SQL `NULL` on new public accounts using the existing nullable columns; no placeholder values or schema changes are needed. Account responses may therefore contain null username and phone values. Existing accounts retain their values, and email/username login remains supported. Staff creation continues through the ADMIN-only account invitation flow with its existing input requirements.

Registration creates only an enabled PATIENT account that must verify its email before login. It does not create or link a patient profile, issue a JWT, or log the user in. HTTP 200 retains the existing response:

```json
{
  "message": "Registration successful. Please check your email to confirm your account."
}
```

Missing, null, or mismatched `confirmPassword` returns HTTP 400 through the existing error envelope. For example, a mismatch returns:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Please correct the request fields.",
  "fieldErrors": {
    "confirmPassword": "Please correct the request fields."
  },
  "requestId": "<request identifier>"
}
```

Bean Validation errors, including missing/null confirmation, use `Invalid value.` as the field message. Errors include `X-Request-Id` matching `requestId` and `Cache-Control: no-store`. Duplicate email addresses still return HTTP 409 `EMAIL_IN_USE` with an `email` field error. Invalid registration does not save an account, create a verification token, or send email.

Email confirmation remains `GET /api/auth/confirm-email?userId=...&token=...`, using the existing single-use 24-hour verification link. Login, JWTs, cookies, CSRF, and account invitations retain their existing behavior. Registration requests that select cookie authentication still need the matching `XSRF-TOKEN` cookie and `X-XSRF-TOKEN` header; clients can obtain the cookie through `GET /api/auth/csrf-token`.

The account's `fullName` and the patient profile's `fullName` are separate values. Profile creation, linking, and updates do not synchronize them in either direction. Creating a patient profile still requires its own `fullName`, `dateOfBirth`, `gender`, and `phoneNumber`; address remains optional. See [Patients API](PATIENTS_API.md) for all patient endpoints.

Regression test code covers confirmation errors, unchanged password boundaries, null account details, email verification and login, independent profile names, required profile phone, and administrative username handling. Tests were not run during the original registration edit; the later historical full run recorded in [TESTING.md](TESTING.md#verification-after-launcher-removal-2026-10-27) passed 141 tests across 17 suites, including RegistrationTest. No tests were run during this documentation review; real SMTP/browser integration remains unverified.
