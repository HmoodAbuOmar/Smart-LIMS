# Admin Operations & Payments

Entry: `AdminOperationsPayments.jsx`. From `Frontend`, run `npm.cmd run dev`, then
open `http://localhost:5173/#/__admin/operationsPayments` or select the existing
Operations & Payments sidebar item. The existing development-only Admin boundary
is preserved; production authentication is unchanged.

`operationsPaymentsService.js` exposes only `load()`. It owns one in-memory dataset
of 42 orders with bilingual patient/test snapshots and linked transactions. No HTTP,
browser storage, payment collection, refunds, order editing or account changes.
Snapshots returned by the service are cloned. This feature has no dependency on
Patients, Booking Slots or Catalog data/services. Shared currency formatting stays
in the existing utility. The Dashboard's details dialog is private to that page's
separate records, so it is not linked to these independent records.

Amounts are integer ILS cents. The inclusive From/To reporting period applies to
order creation dates and transaction confirmation dates when confirmed (falling
back to recorded dates if absent); other transactions use their recorded dates.
Timestamp dates are evaluated in Asia/Jerusalem. Orders and transactions are filtered
independently: a payment may belong to an order created before the selected period.

Summary cards use all records in the period, not the current table search, status,
type, or pagination. Total Orders counts stable IDs once; Confirmed Receipts is gross
confirmed PAYMENT amounts, Refunds is confirmed REFUND amounts, Pending Payments is
pending PAYMENT amounts. Failed/cancelled transactions and pending refunds never
enter confirmed totals. The model also calculates net collections as gross receipts
minus confirmed refunds; no extra summary card is added.

Order status retains NEW/IN_PROGRESS/COMPLETED/CANCELLED. Read-only payment labels
are derived separately from the order's complete transaction history, including
partial payments/refunds. They do not change the order status or introduce backend
states. Table queries and filters remain independent between tabs; changing the
shared reporting period resets both pages. Invalid periods show inline errors and
no matching totals/rows.

Checks from `Frontend`:

```powershell
npm.cmd run build
npm.cmd run lint
node src/admin/operationsPayments/check-operations-payments-model.mjs
node src/admin/operationsPayments/check-operations-payments-browser.mjs
node src/admin/patients/check-patients-model.mjs
node src/admin/catalog/check-catalog-model.mjs
node src/admin/bookingSlots/check-booking-slots-model.mjs
node scripts/check-auth.mjs
node scripts/check-preview-build.mjs
```

Browser checks use an isolated temporary Chrome profile and Vite server and print
the screenshot directory. CHROME_PATH can override the Chrome executable.

Commit scope: this folder, plus the import/render/document-title hunks in
`../components/AdminLayout.jsx`, the title selection in
`../components/AdminNavbar.jsx`, and the allowlist addition in
`../../dev/DevelopmentAdmin.jsx`. No other feature or backup files are needed.
