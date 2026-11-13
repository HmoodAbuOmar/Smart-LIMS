# Admin Reports

Open `/#/__admin/reports` in the Vite development application or select **Reports** in the existing Admin sidebar.

## Sources and limitations

No operational/financial report endpoint or configured frontend report transport exists in the inspected repository. The clinical result PDF endpoint is not an operational reporting API. The role-based UI guide was not present in the workspace; implementation follows the supplied functional description, without asserting a visual match to A10.

The replaceable service loads existing sources only in development:

- Operations & Payments: orders and transactions, including confirmed refunds. Orders are counted by `createdAt`. Confirmed transactions use `confirmedAt`, falling back to `recordedAt`, independently of their parent order's date.
- Ordered tests use the parent order's status because `OrderItem.java` has no independent status. Counts are ordered entries, not distinct catalog tests or result lifecycle counts. Current frontend order states are `NEW`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`; the backend's initial state is `PENDING`. No backend mapping is asserted or introduced.
- Booking Slots: appointments use their linked slot's date. Scheduled includes booked, checked-in, completed and no-show records, excluding cancelled records. Attended is checked-in or completed. These are current statuses, not historical snapshots.
- Dashboard sample rejection events: filtered by event date, counted by distinct sample ID. These events are independent of the Operations & Payments order dataset.

All sections use inclusive calendar-day bounds in `Asia/Jerusalem`. Draft dates do not affect the report until Apply. Print uses the applied period, hides navigation/actions/filters, and includes a clean report. Export is not implemented. Print is disabled until a report is available. Production service use explicitly returns `REPORTS_UNAVAILABLE`; the existing development Admin entry remains excluded from production. No HTTP requests, backend/authentication edits, or mutations of the source datasets occur.

## Verification

From `Frontend/`:

```text
npm run build
npm run lint
node scripts/check-preview-build.mjs
node src/admin/reports/check-reports-model.mjs
node src/admin/reports/check-reports-browser.mjs
```

Browser verification uses installed Chrome (or `CHROME_PATH`), a temporary Vite server and browser profile, and writes screenshots and print PDFs outside the repository. The server/browser close when the check finishes.

Commit scope: this folder, and only Reports import/render/title recognition in `AdminLayout.jsx`, header title recognition in `AdminNavbar.jsx`, and the `reports` development-page allowlist entry in `DevelopmentAdmin.jsx`.
