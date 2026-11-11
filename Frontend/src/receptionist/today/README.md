# R01 — Today / Arrivals & Check-in

Development entry: `/#/__receptionist/today`. Production entry: `/#/receptionist/today` deliberately shows an unavailable message with no appointment records or actions.

## Inspected contracts

There was no receptionist route, workspace, or staff role guard in the frontend. The patient guard in `portal/PortalEntry.jsx` is patient-specific, and `services/serviceTransport.js` is unconfigured. These files and real authentication behavior remain unchanged.

Backend capabilities inspected, not called or modified:

- `AppointmentController` exposes patient-only `/api/appointments/me`, creation, alternatives, cancellation and rescheduling. It does not provide a staff list of today's appointments.
- `VisitController`: `POST /api/visits` records check-in, requiring `orderId`, optional `appointmentId`, explicit `orderItemIds`, `arrivedAt` and an idempotency key. No simplified check-in endpoint is invented.
- `VisitService` permits arrivals for booked backend `CONFIRMED` appointments with an eligible order and no existing visit. R01 local records use the established frontend `BOOKED` label; this is not a claim about the backend wire format.
- `POST /api/appointments/{id}/no-show` exists. Its policy requires `CONFIRMED`, no visit, the expected revision, and slot end at or before the current time. R01 models that policy for explicit, confirmed manual actions only; time never automatically changes status.
- Staff walk-in, order detail, and rescheduling frontend flows do not exist. R01 opens explicit unavailable dialogs rather than patient-owned or invented routes. Other intended navigation items are disabled with an explanation.

The UI guide was not present in the workspace. This screen follows the supplied functional description; no claim of inspecting page 33 is made.

## Local behavior

Fixtures and write operations load only behind `import.meta.env.DEV`. They are held in memory during the current session and reset on reload. No authentication session, HTTP call, database access, or production mutation is introduced. The production entry fails closed until a staff authorization/transport and daily list contract exist.

Today is determined in `Asia/Jerusalem`, including DST. Rows sort by instant with stable ID tie-breaks. Arrivals contains every booking for the day, including recorded no-shows, completed and cancelled bookings; Not Arrived is strictly `BOOKED`. Eligible check-in records need an order and explicit item IDs. Successful writes return the recorded arrival instant and update the row/counts together. Failed writes preserve records; optimistic updates are not used. A write lock prevents duplicate concurrent submissions.

The existing global `LanguageSwitcher` and shared language preference are reused. The new scoped shell uses the existing logo, fonts, icons and teal/mint colors. Narrow tables become labeled rows.

The shared `components/ReceptionistSidebar.jsx` owns the Admin-style footer. Its segmented switcher uses global i18next and `smart-lims.language`; language changes survive reloads. Logout delegates through `receptionistSession.signOut()` to the existing `portalApi.logout()` operation and redirects to the existing login route only after success. That operation currently returns `SERVICE_UNAVAILABLE`; the footer displays an error and preserves the workspace and language preference rather than claiming a sign-out. No new authentication or logout endpoint is introduced. The sidebar scrolls on short screens so both controls remain reachable.

## Checks (from Frontend)

```text
npm run build
npm run lint
node src/receptionist/today/check-today-model.mjs
node src/receptionist/today/check-today-isolation.mjs
node src/receptionist/today/check-today-browser.mjs
node scripts/check-preview-build.mjs
```

Browser checks use installed Chrome (or `CHROME_PATH`) and temporary Vite/preview servers. Profiles and screenshots are written outside the repository. Servers and browser close when the script finishes.

## Shared role sidebar and Today sizing

The shared role sidebar now uses the exact Admin Patients design via components/WorkspaceSidebar.jsx and WorkspaceSidebar.css. Admin, Patient and Receptionist supply their existing menus, icons, active state, navigation, language and Logout callbacks. Receptionist links and check-in permissions are unchanged. The former Patient-sized Receptionist sidebar rules have been removed from receptionistLayout.css.

Shared width is 256px, logo 158x64px and navigation text 14px. At 900px and below the sidebar follows the Admin inline/scrollable layout. Today title, table and control sizing still follows the previously measured Patient Portal reference; check-in controls remain 96px wide and 30px high in all states.

Run node src/components/check-role-sidebars-browser.mjs from Frontend for the Admin-reference sidebar comparison. The optional check-today-sizing-browser.mjs compares Patient and Receptionist content/control sizes; both now consume the same shared sidebar. Lab Technician is not implemented in this checkout and is not claimed as verified.
