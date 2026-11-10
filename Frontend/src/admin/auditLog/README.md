# Admin Audit Log

Development route: `/#/__admin/auditLog`, or use **Audit Log** in the Admin sidebar.

This feature is read-only. No audit endpoint is implemented in the inspected repository. The replaceable service loads local events only when Vite's development flag is enabled; otherwise it reports `AUDIT_UNAVAILABLE`. The existing development Admin entry remains excluded from production. This feature does not change authentication or permissions.

Events remain stable during the current session. Refreshing the application creates the initial local dataset again. Dates are filtered inclusively by calendar day in `Asia/Jerusalem`, the same timezone used to display timestamps. Searches match both languages, entity IDs, and full details. Actor filters use stable actor IDs.

Checks from `Frontend/`:

```text
node src/admin/auditLog/check-audit-log-model.mjs
node src/admin/auditLog/check-audit-log-browser.mjs
npm run build
npm run lint
node scripts/check-preview-build.mjs
```

The browser check uses installed Chrome (or `CHROME_PATH`) and a temporary Vite server and browser profile, then closes them. Screenshots are written outside the repository.

Commit scope: this folder, plus the Audit Log import/render/title changes in `components/AdminLayout.jsx`, title recognition in `components/AdminNavbar.jsx`, and page allowlist in `src/dev/DevelopmentAdmin.jsx`.
