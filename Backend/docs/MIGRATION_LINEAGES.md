# Migration lineage history and reviewed-cutover procedure

NOTIF-38 (2026-10-31) adds V25__patient_notifications.sql after the immutable
V1-V24 split baseline. Current resource set is V1-V25 (23 application tables).
The lineage-equivalence/copy tests and historical procedure below explicitly
compare legacy V9 to canonical V24; they do not treat the later feature as part
of that equivalent baseline. Separate V24-to-V25 checks preserve all existing
DDL/rows/sequences/history and establish an empty inbox without backfill.
This task does not apply V25 to development or change the recorded cutover state.

Updated 2026-10-30. MIG-SPLIT-02 implements the owner-selected Option B from
IMPLEMENTATION_PLAN.md. This is file organization only; API contracts, production
Java, database object definitions and dependency versions are unchanged.

## Completed local transition (2026-10-30)

Local **smart_lims_db** now runs V1-V24; the original is retained as
**smart_lims_db_legacy**, with connections disabled. Both full backups were restored
and verified; the frozen copy, startup/Hibernate validation and 32 final live checks
passed. [Actual evidence, regression limitation and rollback](LOCAL_MIGRATION_CUTOVER.md).
The owner subsequently made `application.yaml` the single main configuration,
selecting `classpath:db/migration` without an active profile. Other environments
were not changed.

## Runtime selection and release rules

| Use | Location | History |
|---|---|---|
| Application runtime and fresh databases | `classpath:db/migration` | Canonical V1-V24 |
| Historical compatibility tests only | `classpath:db/fixtures/historical-v1-v9` | Test-only V1-V9 copies |

`application.yaml` selects canonical V1-V24. The initial split placed original
V1-V9 and new V1-V24 under separate main-resource directories; the approved cleanup
removed those alternate runtime directories. Nine byte-identical historical scripts
remain under test resources solely for old-history reconciliation coverage. They are
not on the application migration path and are never combined with canonical migrations.

Always pair the destination URL with its lineage. New V1-V24 is **not** an upgrade
for a database carrying V1-V9 history. Validation rejects the opposite lineage.
Never repair, baseline, renumber or edit history to disguise that mismatch. There
is no shared next migration number during coexistence: freeze schema changes or
maintain explicitly reviewed equivalents in both lineages until all installations
are transitioned. Future changes must preserve one CREATE TABLE per creation file.

## Exact split inventory

22 creation files contain one CREATE TABLE each. V3 and V16 are the two separate
ALTER migrations. All constraint/index/function/trigger names and SQL definitions
are retained, including the original appointment index replacement at V16.

| New file | Legacy source | Associated objects |
|---|---|---|
| V1__users.sql | V1 | Username index |
| V2__email_action_tokens.sql | V1 | Token indexes |
| V3__password_reset_attempts.sql | V2 | users reset-attempt column/check; no CREATE TABLE |
| V4__patients.sql | V3 | patient_number_seq and patient indexes |
| V5__lab_tests.sql | V4 | Catalog indexes |
| V6__patient_link_tokens.sql | V5 | Link token indexes |
| V7__lab_test_categories.sql | V6 | Category reverse index |
| V8__test_orders.sql | V7 | order_number_seq and order indexes |
| V9__order_items.sql | V7 | Item index |
| V10__appointment_coordination.sql | V8 | Singleton INSERT id=1 |
| V11__appointment_types.sql | V8 | Table constraints |
| V12__appointment_slots.sql | V8 | Slot exclusion constraint |
| V13__appointments.sql | V8 | Appointment indexes |
| V14__appointment_reschedules.sql | V8 | Reschedule indexes |
| V15__test_parameters.sql | V9 | Table constraints |
| V16__appointment_visit_states.sql | V9 | Appointment ALTERs and active-order index replacement; no CREATE TABLE |
| V17__visits.sql | V9 | visit_number_seq and visit index |
| V18__visit_items.sql | V9 | Reverse item index |
| V19__samples.sql | V9 | specimen_barcode_seq and specimen indexes |
| V20__specimen_attestations.sql | V9 | Attestation index |
| V21__test_results.sql | V9 | Current/working indexes; protect_published_result, its trigger and shared protect_published_result_child |
| V22__result_values.sql | V9 | Parameter index and result_values_immutable trigger |
| V23__result_specimens.sql | V9 | Reverse sample index and result_specimens_immutable trigger |
| V24__laboratory_events.sql | V9 | Event indexes, protect_laboratory_event and append-only trigger |

Sequences retain start/increment/min/max/cache/type and unowned behavior; no OWNED
BY or new column defaults are introduced. Parent tables precede children. V21
installs the shared child function before the V22/V23 triggers. Splitting reduces
cross-table migration atomicity: never start the application on a partial chain.
Migrate all 24 and validate before importing data or enabling application traffic.
An interrupted PostgreSQL file transaction can be rerun after fixing its cause;
do not repair history. The failed V22 obstruction/recovery test exercises this.

## Legacy immutability record

These are SHA-256 of the original working-tree bytes before the move; all nine
matched immediately afterward. Flyway checksums are also pinned in
MigrationLineageTest to the assessed applied values. Git line-ending conversion
can affect byte hashes on another checkout; Flyway checksums remain independent
of line endings. No applied SQL statement was edited.

| Legacy filename | SHA-256 before and after move |
|---|---|
| V1__auth_foundation.sql | `a50430fe86000181e2e1d351a29507fc81098d72a3f14c4ce4a9a59d822d8656` |
| V2__password_reset_attempts.sql | `43e1f025e67d1398d041839ae54b48ecd139a019c71b83379e96c60fa029f0ef` |
| V3__patients.sql | `84cc7b2127fb0dcd114d3c93ab434d31df65b5eab98b08551ccc57bc57e1ee7b` |
| V4__lab_tests.sql | `7eefad9a2f89e37d61cf4c648053b5fe977bde51b1551d25b74f3ccecc77c559` |
| V5__patient_link_tokens.sql | `8adfe2373cecd7c12464f135e20a8d9a6b6ea416334f3df47a90da483a0b9831` |
| V6__lab_test_categories.sql | `1af594cad210e97c949b2196134aadca311b2e7d2801908d0d8a2f3acc0d2812` |
| V7__orders.sql | `e5fc8fb582bb506e3566887a59ee22b59637d16c75868c1fe9c962809a2999a8` |
| V8__appointments.sql | `102a4e1f0b681143d8c7e29778234a8bf3762fe43d45f97770cefed76409ea3b` |
| V9__results_visits_samples.sql | `43a8bb000654efac213f35270fc7660802d3f67274d9516574d65d89e45023d6` |

## Data-preserving transition procedure (general reference)

This procedure remains the review package for other installations, not permission
to cut them over. The owner separately authorized the completed local transition;
see LOCAL_MIGRATION_CUTOVER.md for its actual destination, execution and evidence. Complete the installation
inventory first: source identity/URL, PostgreSQL version, history including actual
installed ranks/checksums, roles/grants/extensions, configuration overrides, jobs,
active writers, backup location/retention and rollback owners. Unknown/shared/remote
installations remain unverified. Preserve the source database, original history,
backup and old application artifact throughout; no source DROP or reset is needed.

1. Freeze schema changes. Record source identity and legacy Flyway validation,
   and reject unexpected history/schema drift. Compare full schema DDL against the
   verified legacy shape, excluding only flyway_schema_history; compare ownership,
   grants, extensions, locale/collation and non-public objects separately. This
   implementation compares public application DDL on PostgreSQL 16.15; it does not
   certify another environment's privileges/configuration.
2. Take a private full backup with matching PostgreSQL client tools, verify its
   digest, and restore it into a separately approved rehearsal database. Validate
   legacy history and full business rows there. Rehearse this entire procedure
   with that restored copy, including application/authorization/report smoke checks.
   Synthetic tests are complete; a private real-data backup/restore rehearsal
   remains an operator step. Keep backups outside Git with restricted permissions.
3. Create a separately named **empty** destination, with reviewed role ownership,
   grants, extensions and PostgreSQL settings. Use an approved Flyway runner with
   the project's resolved Flyway version and only
   `filesystem:src/main/resources/db/migration` (or the classpath equivalent
   in the reviewed application artifact). Set its URL explicitly to the destination,
   apply V1-V24, then validate. There is no Flyway CLI/plugin installation added by
   this change. Choose/provision the runner as part of the release review.
   Do not point the running application at this destination yet.
4. Confirm the destination has 24 successful SQL history rows and precisely 22
   application tables, empty except appointment_coordination(id=1). Export and
   retain its complete history separately. Compare source/destination schema DDL
   with the same pg_dump version, ignoring only dump headers, random restrict
   tokens and flyway_schema_history. Record identities and exact object comparison.
5. Stop all application instances, jobs and other writers to the source, retaining
   the old artifact/configuration for rollback. Prove writers are stopped and keep
   them stopped through final copy/verification; pg_dump's snapshot alone does not
   prevent later writes. Take the final full backup and a data-only export including
   sequence state but **excluding public.flyway_schema_history**. Use private
   service definitions/pgpass for credentials; never print or store them in Git.
6. Load into the fresh destination atomically with the administrative loader, as
   shown below. Remove only its newly seeded coordination row before import so
   the source singleton is copied exactly once. Disable triggers only within this
   offline, privileged import: published parents can be copied before their
   immutable children, and samples/results have self-references. Re-enable all
   triggers before the load transaction commits. This is an operator import, not
   a permanent relaxation or a normal application database privilege.
7. Before traffic, compare **every complete row in all 22 tables** with stable
   sorting/hashes, including byte-preserved snapshots, retained UUIDs/timestamps,
   idempotency keys, self-links, historical/current correction versions, specimen
   links and append-only events. Confirm singleton id=1 exactly once; compare all
   four sequence last_value/is_called pairs and options (do not call nextval on
   a real candidate just to check it). Retain the source and destination histories
   unchanged. Check every FK by actual child/parent anti-join, not just convalidated;
   check row CHECK constraints and uniqueness, all triggers enabled, indexes valid,
   schema DDL identical and correct Flyway lineage validation. The synthetic test
   checks every FK and proves trigger enforcement using rolled-back rejected writes.
8. Keep external mail/jobs disabled while running destination application smoke
   checks with synthetic accounts. Verify authentication, ownership, appointments,
   publications/corrections and reports with the reviewed permissions. If smoke
   tests write synthetic data, identify/remove it through approved flows or use
   a separate rehearsal clone; do not silently contaminate the final import.
9. Present the actual source/destination identities, schema/data/sequence/history
   comparisons, backup restore evidence, smoke results, downtime and rollback
   checkpoint for approval. Only after approval change the datasource URL and
   Flyway location **together** to the destination/new lineage, deploy the reviewed
   artifact, verify startup/health and then resume traffic/writers. No such cutover
   or runtime-default change was performed in this implementation.

### PostgreSQL export/import mechanics

Illustrative operator commands below require reviewed private service definitions
`smartlims_cutover_source` and `smartlims_cutover_destination`, tool paths and a
private backup directory. They are intentionally not an unattended script: first
verify each service's actual database/server/data directory, with the source and
destination distinct. Source must be frozen; destination must be newly migrated.
Check every process exit code and stop on failure.

```powershell
# Variables identify approved tools/private storage, never credentials.
& $PgDump 'service=smartlims_cutover_source' --format=custom --file=$FullBackup
if ($LASTEXITCODE -ne 0) { throw 'Full backup failed' }
& $PgDump 'service=smartlims_cutover_source' --data-only --schema=public `
  --disable-triggers --no-owner --no-privileges `
  --exclude-table=public.flyway_schema_history --file=$DataDump
if ($LASTEXITCODE -ne 0) { throw 'Data export failed' }
# Build a private loader file: destination seed removal then the unmodified dump.
$dumpText = [IO.File]::ReadAllText($DataDump)
[IO.File]::WriteAllText($LoadFile,
  "DELETE FROM public.appointment_coordination WHERE id=1;`n" + $dumpText,
  [Text.UTF8Encoding]::new($false))
& $Psql 'service=smartlims_cutover_destination' -X -w `
  --set=ON_ERROR_STOP=1 --single-transaction --file=$LoadFile
if ($LASTEXITCODE -ne 0) { throw 'Import failed; quarantine this candidate' }
```

pg_dump includes the four sequence setval statements, with is_called, in the
export. The destination retains its own new V1-V24 history; neither source nor
source-history data is imported over it. `--disable-triggers` requires the
privileged loader to disable/re-enable internal FK triggers as well as user
triggers. Do not grant that ability to the normal application role.
For very large exports use a streaming prefix+copy operation instead of loading
the dump into memory. Record size/time from the rehearsal before choosing tooling.

### Rollback and failed-copy handling

- Before destination writes: keep/restore the previous application artifact and
  its **source URL + legacy location** pair, verify the unchanged source/history,
  then resume source writers. The destination remains offline for diagnosis.
- A failed import must never be used for cutover. PostgreSQL sequence setval is
  not transactional: row/trigger rollback does not guarantee sequence rollback.
  Quarantine that candidate and provision another approved fresh destination for
  retry. Never truncate/reset the source or repair either history.
- After any destination write, stop all writers again and preserve both databases
  and fresh private backups. Reconcile/replay those writes (including sequence
  allocation, events, retries and correction chains) through a separately reviewed
  process before returning to the source. Switching the URL alone would lose data.
  No automatic reverse import or destructive rollback script is supplied.
- Keep the original database and backups through the approved retention window;
  deleting the source is outside this task. Review environment-specific rollback
  evidence and the point where destination writes start before approval.

## Verification and remaining release work

The local transition is DONE with its explicit regression-rerun limitation; see
[LOCAL_MIGRATION_CUTOVER.md](LOCAL_MIGRATION_CUTOVER.md). The completed local copy
used an owner-only loader disabling the two child USER triggers temporarily;
internal FK triggers remained enabled throughout. The broader privileged-loader
mechanics above are retained as a general reference, not the local execution record.


See [TESTING.md](TESTING.md#migration-lineage-split-verification-2026-10-30) for
actual split-implementation commands, target, timestamps, counts and limits. The
current application default and completed local runtime use canonical V1-V24. Inventory,
backup rehearsals, provisioning, verification and cutover for **other installations**
remain TODO and were not performed by this local task. Existing legacy V4/V5 reconciliation
is a separate historical procedure, never a shortcut for this transition.
