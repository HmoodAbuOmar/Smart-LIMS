# Administrative Test Catalog

From `Frontend`, run `npm.cmd run dev -- --host localhost --port 5173 --strictPort`.
Open `http://localhost:5173/#/__admin/tests`, or expand **Test Catalog** in the
existing Admin sidebar. Direct entries also exist for `/#/__admin/parameters`
and `/#/__admin/referenceRanges`. Select a test, then a parameter where required.
Desktop uses a single test-list/editor workspace (approximately 25%/75%). On mobile, select a test from the list and use Back to Tests to return. Details are edited inline; parameter actions open a modal, and reference ranges are added below their table. Unsaved details or range entries require confirmation before changing tests, tabs, or sidebar destinations. Details show only the selected interface language, using the global language switch. Hidden bilingual values are retained when editing and saving. Missing hidden-language required values reveal that language with an explanation. Sample type is a shared code with translated dropdown labels. The compact Details form has a maximum reading width of 650px. Fresh fixtures use recognizable laboratory test names; preparation instructions and reference ranges start empty. Existing records supplied to the service are never reseeded.

These entries use the existing DEV-only Admin boundary; production authorization
and backend files are unchanged.

`adminCatalogService.js` is the replaceable asynchronous, in-memory boundary.
All three views share its tests/parameters/ranges and stable parent IDs. Switching
between catalog sidebar items retains context. Leaving and returning reloads the
same in-memory records; a page refresh resets local changes. No HTTP or browser
storage is used. Definitions and explanatory text contain English/Arabic values;
codes, IDs and units are not translated. Feedback does not claim server persistence.

Tests support definition editing, scoped unique codes, ILS prices stored in integer
cents, active/inactive status, and a deactivation confirmation. Only test metadata
changes; existing orders/prices and result snapshots are never rewritten.
Historically used parameters retain their type, unit, and measurement method;
use a replacement parameter and deactivate the previous one for semantic changes.
A parameter with reference ranges also cannot change type in place.

Reference ranges start empty. Users enter numeric limits or paired reference text
according to parameter type. All age/date bounds may be unbounded; blank means
`null`, never zero. Ages and validity use `[start,end)`. Overlap is rejected only
for the same parameter and exact sex value when both dimensions overlap; adjacent
intervals are allowed. ANY has no invented precedence over MALE/FEMALE. A numeric
range requires at least one entered limit. Date validity is evaluated at day
granularity using the browser's local current date. Expired records remain visible
through the history control and cannot be changed. Closing validity changes only
`validTo`, never the range ID or its reference values. No clinical interpretation,
critical thresholds, report editing, deletion, or historical-result recalculation
is implemented.

Checks from `Frontend`:

```powershell
npm.cmd run build
npm.cmd run lint
node src/admin/catalog/check-catalog-model.mjs
node src/admin/catalog/check-catalog-browser.mjs
node src/admin/patients/check-patients-model.mjs
node src/admin/patients/check-patients-management-browser.mjs
node scripts/check-preview-build.mjs
```

Browser checks start temporary Vite servers and isolated Chrome profiles and print
their screenshot folder. Use `CHROME_PATH` for a nonstandard Chrome location.
Together they exercise both scripts/languages, narrow layouts, mutations, errors, historical
locks, overlap/adjacency, unbounded values and validity closure without API calls.
