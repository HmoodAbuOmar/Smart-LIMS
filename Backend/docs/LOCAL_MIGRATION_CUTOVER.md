# Local V1-V24 database cutover

Status: DONE for the local database transition. Completed 2026-10-30.
Task MIG-CUTOVER-LOCAL-01; owner explicitly authorized backup/restore verification,
fresh-database transfer, nameswap, local activation and functionality verification.
The earlier preparation-only restrictions are superseded for this local instance
only. Other installations/environments were not changed.

## Final local state

| Item | Verified state |
|---|---|
| Server | Existing PostgreSQL 16.15 on localhost:5432; main data directory C:/Program Files/PostgreSQL/16/data |
| Active database | **smart_lims_db**, OID **25256**, owned by existing **smart_lims_user**, connections enabled |
| Retained original | **smart_lims_db_legacy**, OID **16508**, connections disabled; default_transaction_read_only=on |
| Temporary destination name | smart_lims_db_v2 no longer exists: its OID is now the active smart_lims_db |
| Current Flyway history | **V1-V24**, 24 successful SQL records |
| Original history | Original V1-V9 rows, including installed ranks 4/5 for linking/lab reconciliation, retained unchanged in the original database |
| Active migration location | **classpath:db/migration**, selected by the sole main `application.yaml`; no profile required |
| Runtime | IntelliJ SmartLimsApplication, no active profile per owner report; startup previously verified on HTTP port 8080 |
| Hibernate | Current main setting `ddl-auto: none`; owner-reported startup initialized Hibernate successfully |
| Shared default | `application.yaml` selects canonical V1-V24 for normal startup |

The existing database URL and credentials were retained. No credential or database
setting was changed during the repository cleanup.
The existing postgres administrator connection supplied by the owner was used for
CREATE DATABASE and the two renames. The application role remains non-superuser
and has no CREATEDB privilege; no role/password changes were made on the main server.

After the cutover, the owner manually made `application.yaml` the only main
configuration and selected `classpath:db/migration`, retaining
`ddl-auto: none` and Flyway enabled. The owner-reported no-profile startup
validated 24 migrations at V24, performed no migration, initialized Hibernate and
started on port 8080. The 24 canonical files matched the verified V1-V24 source
byte-for-byte before the staging directory was removed.

The owner-approved cleanup removed `db/migration-legacy/`,
`db/migration-one-table/` and the test-only `application-local.yaml`. Historical
V1-V9 SQL used by reconciliation coverage was retained in test fixtures under
`src/test/resources/db/fixtures/historical-v1-v9/`; no fixture is an application
migration location. Test code now uses the canonical main directory for V1-V24.
No datasource URL, credential, database, schema, application data or Flyway history
was changed during this resource cleanup. The original database remains available
for rollback and has not been deleted.

## Backups and verified restoration

Private directory (restricted to the current Windows user and SYSTEM):
`C:/Users/hmood/Documents/Smart-LIMS-DB-Backups/cutover-20261030-204435/`.
Full dumps contain private business/account data and must remain outside Git.
The directory also contains manifests, SHA-256 files, comparison evidence and logs.

| Backup | Bytes | SHA-256 |
|---|---:|---|
| `smart_lims_db-initial.dump` | 110009 | `43d0fc6a2fb455e89f570375d0b86d460bdc77eb20029f8a000a4ba34589cd09` |
| `smart_lims_db-final-frozen.dump` | 110224 | `eb44e219339418b74317cc449a823ba9866e2f13165ff28e4a6d71ec5ca15384` |

The initial backup was taken before source database/configuration mutations and
fully restored/verified at **2026-10-30T20:54:08.132146+02:00**. The frozen
final backup was independently restored/verified at
**2026-10-30T21:05:37.025620+02:00**, before the final data transfer
and nameswap. Final digest rechecks passed after application verification.

Restoration used a fresh private PostgreSQL 16.15 cluster on **127.0.0.1:55433**,
with SCRAM authentication and the existing credential; no other machine's server
or regression database was used to store real backup data. Both full restores
matched all **23 tables including complete Flyway history**, all rows and sequence
states, ownership/grants and actual constraints. The private restore application
and server are stopped; the offline restore files remain inside private storage.
The transient initdb password file was deleted immediately after initialization.

PostgreSQL dump/reparse changed the textual rendering of 19 CHECK expressions
(flattened AND / array-cast syntax) and two partial-index predicates in restored
copies. This was investigated rather than discarded from comparison: fresh V1-V24
DDL matched the actual source DDL **exactly**, and PostgreSQL dump/reparse of an
independent fresh schema reference exactly matched the restored legacy DDL,
including ownership/grants. No source or migration SQL was rewritten to normalize it.

## Frozen transfer and verification

Application PID 19832 and the private rehearsal app were stopped. With no source
clients or prepared transactions remaining, the database owner set the source's
read-only default. A dedicated transaction held SHARE locks on every source
application/history table during final backup, restoration, copy and comparison.
The original data did not change between the initial backup and frozen transfer.

V1-V24 was applied to a fresh main-server smart_lims_db_v2 using existing
smart_lims_user credentials, with source encoding/locale/ownership preserved.
The data-only copy excluded public.flyway_schema_history; the fresh coordination
seed was removed inside the same load transaction and replaced by the original
singleton. Only USER triggers on result_values and result_specimens were temporarily
disabled during the atomic import and re-enabled before commit. **All FK triggers
remained active**; superuser loading/constraint removal was unnecessary.

Actual comparisons/checks passed:

- **130 complete business rows across all 22 application tables**: exact sorted
  JSON row hashes/counts; UUIDs, snapshots, timestamps, retry identities, retained
  correction/self-links, publications/specimens and events preserved.
- Exact public application DDL before/after copy and after startup, excluding only
  the intentionally separate Flyway history. Includes types/defaults/nullability,
  PK/unique/FK/check/exclusion constraints, ordinary/partial indexes, all four
  sequence definitions, three functions and four user triggers.
- **53 actual FK anti-joins** and **83 row CHECK expressions**: no violations.
  All constraints validated; **86 public indexes including Flyway's index** valid,
  ready and live; all user/internal triggers enabled as originally defined.
- Source history remained unchanged; destination retained its own 24 successful
  records. No baseline, repair, checksum relabeling or manual history changes.
- Ownership, grants, locale/collation and application-role privileges match.
- Sequence last_value/is_called pairs matched without consuming nextval:

| Sequence | last_value | is_called |
|---|---:|---|
| patient_number_seq | 7 | true |
| order_number_seq | 8 | true |
| visit_number_seq | 2 | true |
| specimen_barcode_seq | 4 | true |

Both databases were then set ALLOW_CONNECTIONS=false, with zero remaining clients.
The nameswap used individually tracked administrator statements while both remained
fenced: original -> smart_lims_db_legacy, v2 -> smart_lims_db. OID comparison proved
identity preservation; no existing target was overwritten or dropped. Only the
new active database was reopened. The retained source stays fenced and read-only.

## Application and functionality verification

The application restarted using its existing IntelliJ launch configuration.
Actual startup **2026-10-30 21:10:52 +02:00**: local profile; Flyway validated all
24 migrations, reported current V24 and no migration necessary; Hibernate
validation completed, followed by Tomcat on 8080 and successful application startup.

**32 rehearsal checks and 32 final checks passed**. Used only six previously
created synthetic @example.invalid accounts through normal login. Verified current
accounts, catalog, profile, orders, appointments/types, visits/archive, biomarkers/
trends, staff reads, current publication/version history, current and superseded
PDF downloads, anonymous denial, role denial and foreign-record concealment.
All positive JSON read-response hashes match the rehearsal. Both downloaded PDFs
were complete, with appropriate content type/no-store headers. No passwords,
tokens or response bodies were written into shared evidence.

A complete post-smoke snapshot still matched the frozen transfer: no business-row
or sequence mutations from verification. Final checkpoint:
**2026-10-30T21:13:14.314803+02:00**. This checkpoint does not claim future application
writes can be discarded; rollback must reassess the current data at execution time.

### Regression rerun limitation

A direct `.\mvnw.cmd test` rerun was attempted with the existing mapping/guard and
test-profile pin. The disposable instance's recorded temporary directory was no
longer a valid cluster; pg_ctl failed and psql on 127.0.0.1:55432 reported an
unexpected server disconnect. The shell continued into Maven after those failed
prechecks; the task attempted to stop it once detected, but it had already failed.
The run finished **21:06:44 +02:00**, **36.423 s**, **BUILD FAILURE**:
**372 cases / 50 suites, 323 errors, 0 assertion failures, 0 skips** (49 unit cases
passed). Errors were isolated-connection/application-context failures. No fallback
to development was permitted; direct main data fingerprints remained unchanged.

The earlier 20:10:48 isolated **372/372** run belongs to split implementation and
remains historical evidence, not a successful post-cutover rerun. The unavailable
test instance was not rebuilt as an incidental other-environment change. Restore
the approved disposable test instance, independently re-confirm isolation, then
rerun the complete suite. No application Java/package or API behavior changed here.

## Rollback (documented, not executed)

Preserve the original database and both backups. Rollback requires the existing
local administrator connection to **postgres**, never a connection to the database
being renamed. Do not overwrite any name or drop either database.

1. Stop every application/job/writer. Take a fresh private backup of the active
   V24 database. Compare all current business rows and sequence states with the
   frozen-cutover snapshot in private state.json. If any post-cutover writes exist,
   preserve both databases/backups and reconcile/replay those writes through a
   separately reviewed process before reverting. Do not lose events, retry keys,
   corrections or sequence allocations by simply switching names.
2. Only after confirming no data would be lost, choose an unused retention name
   such as smart_lims_db_v24_retained_<timestamp>. Set the active database
   ALLOW_CONNECTIONS=false, disconnect its remaining clients and confirm zero.
   The retained original is already connection-fenced. Check every name/OID.
3. Rename active smart_lims_db to that unused retention name, then
   smart_lims_db_legacy to smart_lims_db. Keep both fenced while changing names;
   if a step fails, inspect the actual names/OIDs before proceeding.
4. Restore the original database setting: the pre-cutover database-level settings
   were empty, so `ALTER DATABASE smart_lims_db RESET default_transaction_read_only`
   removes the temporary fence. Set ALLOW_CONNECTIONS=true only on the restored
   original. Keep the V24 retention database offline.
5. Roll back the application only with a reviewed pre-cutover artifact and its
   matching configuration, which must package the original V1-V9 migrations at
   its expected runtime location. The current canonical artifact contains only
   V1-V24; test-only historical fixtures are not runtime resources. Rehearse the
   retained artifact against a disposable old-lineage copy, then restore its
   datasource URL without changing credentials. Validate the nine legacy history
   identities, Hibernate startup and functionality before resuming writers.
   No repair/baseline/history update is part of rollback. Confirm the prior
   application artifact is retained before relying on this rollback path.

[PostgreSQL ALTER DATABASE](https://www.postgresql.org/docs/16/sql-alterdatabase.html)
defines the rename/connection controls; [ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html)
distinguishes USER from internal constraint triggers.

## Remaining steps and preserved work

The **local cutover is complete**. The remaining verification follow-up is recovery
of the approved disposable regression instance and a green full-suite rerun.
Retain backups/original for the owner's retention window; eventual removal is a
separate decision. Other-environment inventory/cutover remains unperformed and
unauthorized by this local task. No commit, push, Postman or frontend work.

Preserved the unrelated ResultPublicationService.java edit byte-for-byte
(SHA-256 d21a8b16f8b41d5862ddd0fe524511f15dc4ebc12d8db2d4a2ac03a0d8b83c97),
canonical migration bytes, POM/dependencies, isolation guard, Maven URL mapping,
security/clinical rules and datasource settings. The original V1-V9 SQL remains
byte-identical in test fixtures for historical checks. No production Java
package/class changes were made.
