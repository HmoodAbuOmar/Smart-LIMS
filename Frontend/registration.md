# SmartLIMS authentication and patient onboarding

The current functional specification and integration blockers are documented in
[PATIENT_API_REQUIREMENTS.md](./PATIENT_API_REQUIREMENTS.md).

The latest three-screen patient-file implementation, back-navigation retention,
Login/Sign Up error diagnosis and component-test results are documented in
[PATIENT_FILE_REPORT.md](./PATIENT_FILE_REPORT.md).

The approved split-card styling and homepage are unchanged. The implemented
frontend sequence is account registration, email verification, login, protected
patient-file selection, new-file creation or verified existing-file linking, and
protected dashboard routing. Password recovery/reset screens are also prepared.

No backend endpoints exist in this checkout. No account, email delivery,
verification, session, patient record, linking, or medical dashboard data has been
verified end-to-end. Service interfaces reject unavailable operations; no success
or authentication is fabricated. Patient routes remain closed until a real server
confirms authentication, verified email, role and linked-file status.

All developer integration details, proposed API paths/payloads, session rules,
missing challenge/schema requirements, modified files and per-step test statuses
are in the requirements document. They are not displayed as permanent UI notices.

From Frontend run:

- npm.cmd run build
- npm.cmd run lint
- npm.cmd run test:auth
- npm.cmd run test:i18n
- node scripts/check-registration.mjs

For browser checks start npm.cmd run dev -- --host 127.0.0.1, then run
node scripts/check-registration-browser.mjs in another terminal. Chrome is used
without extra dependencies. Override CHROME_PATH and AUTH_TEST_URL if needed.
