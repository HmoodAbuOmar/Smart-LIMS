# Admin Booking Slots

Entry: `AdminBookingSlots.jsx`. Uses the existing Admin sidebar, header and global
language switch. From `Frontend`, run `npm.cmd run dev` and open
`http://localhost:5173/#/__admin/bookingSlots` (adjust the port if Vite selects another).
The route stays behind the existing development-only Admin preview boundary.

The replaceable `bookingSlotsService.js` keeps records in memory for the current
page session, matching Patients/Catalog. Navigating away and back retains changes;
refreshing resets them. No HTTP, database, authentication, or local-storage writes.

Time fields have explicit 12-hour hour/minute/AM-PM selectors (Arabic periods: ص/م), while saved records keep HH:mm. Tables and result dialogs use the same padded 12-hour formatter. Create success shows the saved date/time and OK; validation/save failures preserve entries and inline errors, with Back to form restoring the relevant control. Saving is guarded against duplicate submissions.
Slot and appointment IDs are stable; slot writes never change appointment records.

Occupancy counts BOOKED and CHECKED_IN only. Inactive slots still reserve their time
intervals. Intervals are [start,end), so adjacent slots are allowed. New/changed
start times must be in the future in Asia/Jerusalem, matching the laboratory scheduling zone rather than the browser timezone. The selected date and time are validated together. Nonexistent DST wall times are rejected; repeated times use their first occurrence.
Capacity is a positive safe integer and cannot be below current occupancy. Date/time
changes are locked while occupancy is nonzero. Deactivation needs confirmation and
preserves every appointment. This module does not manage/reschedule appointments or
connect its standalone records to the separate portal/overview datasets.

Checks from `Frontend`:

```powershell
npm.cmd run build
npm.cmd run lint
node src/admin/bookingSlots/check-booking-slots-model.mjs
node src/admin/bookingSlots/check-booking-slots-browser.mjs
node src/admin/patients/check-patients-model.mjs
node src/admin/catalog/check-catalog-model.mjs
node scripts/check-auth.mjs
node scripts/check-preview-build.mjs
```

The Chrome check uses an isolated temporary profile/server, fictional records and
prints its screenshot directory. Set CHROME_PATH if Chrome is installed elsewhere.

Commit scope: this entire feature folder plus only the Booking Slots import,
render/title changes in `../components/AdminLayout.jsx`, the title selection in
`../components/AdminNavbar.jsx`, and the preview allowlist addition in
`../../dev/DevelopmentAdmin.jsx`. No backend, dependencies, generated files, or
other Admin feature changes are required.
