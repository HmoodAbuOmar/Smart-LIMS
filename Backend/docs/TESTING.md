# Database-backed test setup

SDLC traceability: R-NFR-01 and per-task acceptance in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The run records below are historical evidence; this 2026-10-27 documentation review did not run tests, start the application, or check current database/server availability. A future implementation task must record its own command, isolated target, date, counts and result before DONE. The separately recorded development recovery is described in [DATABASE_DESIGN section 1.1](DATABASE_DESIGN.md#11-implemented-migrations-and-recorded-reconciliation).

The integration suites require an explicitly disposable PostgreSQL instance with a
database named `smartlims_auth_regression`, accessed on loopback as `postgres` with
an empty password. Their fixtures truncate application tables. Do not use a
development or shared database. Start and prepare the disposable instance separately.

## Configured local instance (2026-10-27)

A fresh PostgreSQL 16.15 cluster is running separately from the development service:

- Listener: `127.0.0.1:55432` only.
- Database: `smartlims_auth_regression`; user: `postgres`; empty password, with
  trust authentication restricted to IPv4 loopback on this disposable cluster.
- `SMARTLIMS_TEST_DATABASE_URL` is saved in the current Windows user's environment
  as `jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression`.
- `SMARTLIMS_TEST_POSTGRES_DATA` is saved in the same environment and identifies
  this cluster's fresh temporary data directory, outside the repository.
- No development role privileges or application connection variables were changed.

Connectivity was verified against this isolated instance, including its actual data
directory, database, user, listener, and port. At original setup the database had
zero application tables. Test runs apply and validate Flyway migrations only in
this isolated cluster; development data and migration files remain unchanged.

## Direct Maven Wrapper execution

From Backend, run the complete suite directly:

```powershell
.\mvnw.cmd test
```

This machine has an explicitly configured `.mvn/maven.config` containing:

```text
-Dsmartlims.test.database.url=jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression
```

The file is machine-local and excluded through `.git/info/exclude`; it contains
only the isolated URL, with no credentials. Maven reads it on every invocation,
including from a terminal that has not inherited the Windows user environment.
Do not add database credentials or a development URL to this file.

The POM maps `smartlims.test.database.url` into Surefire's forked test JVM as
`SMARTLIMS_TEST_DATABASE_URL`. The property defaults to the Maven process's
`SMARTLIMS_TEST_DATABASE_URL` environment value when there is no explicit Maven
property. A local Maven configuration or command-line property takes precedence.
There is no database URL default in the tracked POM. Without an explicit isolated
target, the existing Java guard still fails before datasource startup.

For another machine without the local Maven file, explicitly configure the
isolated target through the environment or a Maven property, for example:

```powershell
.\mvnw.cmd '-Dsmartlims.test.database.url=jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression' test
```

The isolated PostgreSQL cluster must already be running. IsolatedPostgresTest
supplies the test-only `postgres` username and empty password; application
connection settings are never used as a fallback. The full suite also creates
and removes its own `smartlims_migration_*` databases on this same isolated cluster.

To select a single suite, pass Surefire's test selector directly to the wrapper:

```powershell
.\mvnw.cmd '-Dtest=RegistrationTest' test
```

## Reconciliation test fixture

The guarded reconciliation SQL is retained unchanged at
[`src/test/resources/db/fixtures/reconcile-patient-linking-v4-to-v5.sql`](../src/test/resources/db/fixtures/reconcile-patient-linking-v4-to-v5.sql).
`PatientMigrationCompatibilityTest` loads it from the test classpath and executes
it only in newly created `smartlims_migration_*` databases on the isolated cluster.
The fixture is outside Flyway migration locations and is not packaged with the
application's main resources. Its database-name, connected-client, checksum,
locking, timeout, and single-row safeguards remain in place. Any manual use
outside disposable tests still requires the explicit authorization and verified
backup described in the [reconciliation runbook](PATIENT_LINKING_V5_RECONCILIATION.md).

## Restarting the isolated PostgreSQL cluster

The isolated server is a user process, not an automatically starting Windows
service. After a reboot or manual shutdown, start this cluster before testing:

```powershell
$testPgData = [Environment]::GetEnvironmentVariable('SMARTLIMS_TEST_POSTGRES_DATA', 'User')
& 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' -D $testPgData -l (Join-Path $testPgData 'server.log') -w start
```

The cluster is disposable and its temporary directory can be removed by system
cleanup. If that happens, provision a fresh isolated cluster and update the two
user environment values; do not reuse a development database.

## Process environments and IntelliJ

Saving a Windows user environment value also does not update an already running
terminal, IDE, or agent. A child process inherits its parent's environment, not a
fresh copy of the current Windows user settings. Opening a new IntelliJ terminal
tab can therefore inherit the same old environment from IntelliJ. Without the
local Maven configuration, Maven and the Java tests only see that inherited
process environment.

The local Maven file and Surefire mapping fix direct wrapper execution without
restarting IntelliJ. For IntelliJ's Maven tool window, enable **Use settings from
.mvn/maven.config** under **Build, Execution, Deployment > Build Tools > Maven**,
select the Maven wrapper, and reload the Maven project. Alternatively, set the
`smartlims.test.database.url` property explicitly in the Maven run configuration.
See [IntelliJ Maven settings](https://www.jetbrains.com/help/idea/maven-support.html).

If relying solely on Windows environment inheritance instead, fully exit and
restart IntelliJ from a process with the updated environment; also restart a
stale parent launcher such as Toolbox if applicable. Closing a terminal tab or
reloading Maven does not refresh IntelliJ's own inherited environment. Direct
IntelliJ JUnit runs do not use Surefire or `.mvn/maven.config`; set the guarded
`SMARTLIMS_TEST_DATABASE_URL` in that JUnit run configuration, or restart the IDE
so it inherits the variable. No system-wide environment change is required for
the direct-wrapper solution above.

## Diagnosing context startup failures

If Surefire reports `ApplicationContext failure threshold (1) exceeded`, inspect
the first `Failed to load ApplicationContext` and its `Caused by` chain.

The 2026-10-27 reports contain 108 errors: five original failures at
`IsolatedPostgresTest.isolatedProperties` with `IllegalStateException: An explicitly
isolated regression database is required.`, and 103 cascading threshold errors.
The guard rejects a missing or incorrectly formatted isolated database URL before
datasource/Flyway startup. The variable was absent in the environment inspected
during diagnosis. The environment condition on the abstract test base is not
inherited by subclasses; do not rely on it to skip database-backed suites when
configuration is absent. Supply the required isolated database configuration instead.

The guard remains enforced, with a more actionable message. No tests,
database connections, or migrations were run during the original diagnosis.
The subsequent isolated setup above configured the required URL. A complete run
then eliminated the context errors and exposed a separate missing reconciliation
SQL artifact, already referenced by the compatibility tests and reconciliation
runbook. Restoring that guarded SQL resolved all six migration compatibility tests
without changing their assertions or any applied migration file. Its test executions
use only newly created `smartlims_migration_*` databases on the isolated cluster;
the development reconciliation procedure was not run during that verification.

## Earlier verification (2026-10-27)

The affected compatibility suite passed all six tests. The final complete run on
the final code then succeeded from a fresh PowerShell process using the former
launcher's saved-user environment fallback. Use direct Maven wrapper execution
as documented above for current runs.

Maven reported **141 tests, 0 failures, 0 errors, 0 skips**, `BUILD SUCCESS`, in
53.399 seconds (finished at 16:28:50 +02:00). The test JVM's Flyway/Hibernate logs
confirmed `jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression`. All six
migration compatibility cases executed, including wrong-database, checksum, and
connected-client rejection plus data/metadata preservation. Existing assertions,
the isolation guard, password policy, and applied migration files were unchanged.

## Direct-wrapper verification (2026-10-27, after the earlier pass)

Before the Maven mapping was added, direct `.\mvnw.cmd test` reproduced the latest
failure: 141 tests, 108 errors, 6 skips. Its first startup cause was the missing
process-level `SMARTLIMS_TEST_DATABASE_URL`, despite a valid saved Windows user
value. The threshold errors were consequences of that startup failure.

After configuring the explicit local Maven target and the Surefire environment
mapping, an invalid `smartlims.test.database.url` was verified to fail the
existing guard before datasource startup. The final complete verification used
the wrapper directly, with the parent process's test URL still unset:

```powershell
.\mvnw.cmd test
```

Result: **141 tests across 17 suites, 0 failures, 0 errors, 0 skips**,
`BUILD SUCCESS`, finished at 17:08:10 +02:00 in 1 minute 5 seconds. This was a
separate direct-wrapper run. The test JVM's database logs confirmed the isolated
cluster on `127.0.0.1:55432`. No development
data, applied migration file, test assertion, isolation guard, password policy,
or context failure threshold was changed for this fix.

## Verification after launcher removal (2026-10-27)

After moving the SQL unchanged into test resources, updating the compatibility
test to load it from the classpath, and removing the redundant launcher and its
directory, the complete suite ran once with `.\mvnw.cmd test` using the unchanged
local Maven configuration.

Result: **141 tests across 17 suites, 0 failures, 0 errors, 0 skips**,
`BUILD SUCCESS`, exit code 0, finished at 17:29:52 +02:00 in 1 minute 4 seconds.
All six migration compatibility tests passed. Database logs confirmed the isolated
cluster on `127.0.0.1:55432`; reconciliation tests used only their newly created
`smartlims_migration_*` databases. No development database reconciliation was run.
SHA-256 checks confirmed that the SQL fixture's contents, main Flyway migrations,
local Maven test configuration, pre-existing POM/isolation-guard changes, and
retained database backup files were preserved.

## Task 2 category persistence verification (2026-10-28)

Scope: Stage 1 Task 2 only, extending R-CAT-01/R-NFR-01 and S1-CAT-R01/R04.
V6 adds category persistence; DTOs, controllers, services, query filters, and
availability permissions remain unchanged. This record is separate from the
earlier full-suite runs above. The complete suite was not run for Task 2.

Before testing, inspected the configured temporary cluster's postmaster files,
postgresql.conf and pg_hba.conf; pg_ctl confirmed it was stopped. Started only
that disposable cluster. An explicit psql connection to
127.0.0.1:55432/smartlims_auth_regression confirmed PostgreSQL 16.15, user
postgres, matching SMARTLIMS_TEST_POSTGRES_DATA directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df, and loopback-only
listen_addresses. A separate listener inspection also confirmed 127.0.0.1:55432.
The unchanged machine-local Maven config and Surefire mapping selected this
guarded database. No application datasource defaults or smart_lims_db connection
were used. Migration suites created/dropped only their own generated
smartlims_migration_<32 hex characters> databases on this same isolated instance.
Persistence tests use rollback transactions and fake VerificationEmailSender.

Exact initial command, from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestCategoryMigrationTest,LabTestCategoryPersistenceTest,LabTestManagementTest,PatientMigrationCompatibilityTest' test
```

Initial result: 20 tests, 0 assertion failures, 3 errors, 0 skips; exit 1,
finished 2026-10-28 00:02:52 +02:00. All four category migration, seven catalog,
and six patient migration compatibility cases passed. The three new persistence
cases hit the existing lab_tests_code_check because their UUID-derived synthetic
codes contained lowercase letters. Corrected only the synthetic factory with
Locale.ROOT uppercase; production validation and test assertions were preserved.

Reran only the affected suite:

```powershell
.\mvnw.cmd '-Dtest=LabTestCategoryPersistenceTest' test
```

Result: **3 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 00:03:44 +02:00 in 30.483 seconds. No production code or
other tested suite changed after the initial execution. Final per-suite results
are therefore 20 distinct passing cases across these two invocations, not a
single green 20-test Maven invocation:

| Suite | Passing cases | Verification |
|---|---:|---|
| LabTestCategoryMigrationTest | 4 | Fresh V1-V6 and indexes; V5 upgrade with every catalog field/timestamp and prior Flyway metadata unchanged; repeat migration no-op; duplicate/invalid/null/orphan constraints; concurrent duplicate insertion |
| LabTestCategoryPersistenceTest | 3 | Hibernate schema validation; round trips for zero/one/multiple/shared/all-seven categories; removal/clearing without removing the test; current PUT/status operations preserve assignments |
| LabTestManagementTest | 7 | Current catalog HTTP/security/search/pagination/concurrency behavior; create/detail JSON still omit categories; FK-aware isolated fixture cleanup |
| PatientMigrationCompatibilityTest | 6 | Existing fresh/upgrade/reconciliation and guard checks with V6 included in expected history; all assertions retained |

Post-run read-only checks on the guarded regression database confirmed successful
V6 history and zero remaining owned migration databases. SHA-256 comparisons
confirmed 116 captured files unchanged, including V1-V5, local Maven
configuration, isolation guard, application API files, unrelated documentation,
and local-only exclusions. git diff --check passed. Task 2 is DONE; no
development/production migration or readiness was verified.
Tasks 3-5 (array DTOs/assignment, membership queries and patient inactive-test
restrictions) remain TODO and were not implemented or tested as target behavior.


## Task 3 administrative category assignment verification (2026-10-28)

Scope: Stage 1 Task 3 only; R-CAT-01/R-NFR-01 and S1-CAT-R01/R03/R04,
using DONE Task 2 persistence and the finalized category contract. POST accepts
optional categories; PUT replaces/clears the complete set within the existing
row-lock transaction. Every response includes all assignments in contract order
or []. PATCH status, ADMIN-only writes, authentication and CSRF are preserved.
Tasks 4-5 membership filters/patient inactive-test restrictions remain TODO.

Before execution, independently inspected the saved temporary test data directory,
postmaster files, postgresql.conf and pg_hba.conf. pg_ctl reported no running
server and no 55432 listener was present; started only that disposable cluster.
PostgreSQL recovered from its prior interrupted shutdown and became ready.
An explicit psql connection confirmed PostgreSQL 16.15, current_database
smartlims_auth_regression, user postgres, server/listen_addresses 127.0.0.1,
port 55432, and the exact temporary data directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df. A separate listener
inspection matched 127.0.0.1:55432 and that cluster's postgres process. The
unchanged local Maven config/Surefire mapping selected this guarded target.
No smart_lims_db connection or application datasource fallback was used.
Database-backed tests use synthetic fixtures and fake VerificationEmailSender;
management fixtures truncate only the guarded regression database, while the
persistence suite uses rollback transactions. No compatibility database was
created. Flyway validated all six existing migrations and reported V6 current,
with no migration necessary; Hibernate schema validation succeeded.

Exact initial command from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestRequestTest,LabTestServiceTest,LabTestErrorHandlerTest,LabTestCategoryPersistenceTest,LabTestManagementTest' test
```

Initial result: **28 tests, 3 failures, 0 errors, 0 skips; BUILD FAILURE**,
exit 1, finished 2026-10-28 16:23:11 +02:00 in 1 minute 1 second.
All 18 request/service/error-handler/persistence cases passed. Seven of ten
management cases passed. Two new assertions hit Spring JsonPath's conversion
of immutable expected Lists into their concrete implementation type, yielding
null during assertion conversion; switched to Hamcrest equality to compare
arrays directly without conversion. The anonymous-write setup also incorrectly
expected 401 before satisfying existing CSRF protection (which returns 403
first). Supplied valid CSRF without an access token to reach and assert 401.
These were test-only corrections; no production/security change followed the
initial run, and the full array/order and authentication assertions are retained.

Reran only the affected suite:

```powershell
.\mvnw.cmd '-Dtest=LabTestManagementTest' test
```

Result: **10 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 16:25:51 +02:00 in 52.869 seconds. Final evidence covers
**28 distinct passing cases across these two invocations**, not a single green
28-test Maven invocation:

| Suite | Passing cases | Evidence |
|---|---:|---|
| LabTestRequestTest | 5 | Existing field/JSON/query validation plus optional categories, exact identifiers, duplicate/null rejection and strict JSON element/container types |
| LabTestServiceTest | 6 | Service authorization, uniqueness/constraint translation, availability/status behavior and identifier handling |
| LabTestErrorHandlerTest | 4 | Existing validation/error envelope, request IDs, JSON, method and content-type statuses |
| LabTestCategoryPersistenceTest | 3 | Existing zero/one/multiple/shared/all-seven mapping checks; updated full replacement round trip and status preservation |
| LabTestManagementTest | 10 | Real PostgreSQL plus MockMvc/security: POST omission/null/[]/single/multiple/all seven; reverse input normalized to contract response order; full arrays in create/detail/list/status; complete replacement, membership removal, repeated replacement, all three clearing forms, preserved availability; invalid/duplicate/null/blank/padded/lowercase/unknown/excessive values and wrong JSON types on POST/PUT; unchanged complete row/timestamps and assignments after invalid/conflicting updates; existing field validation, pagination/search/concurrent creation, ADMIN-only bearer/cookie writes, anonymous 401 after valid CSRF, missing/mismatched/valid cookie CSRF for every write and role |

Documentation verification parsed all seven catalog JSON examples; git diff
--check passed. Pre-task SHA-256 comparisons preserve all unrelated captured
files, including the four unrelated modified documents, V1-V6, security/controller/
repository/query/entity code, POM, isolation guard, local Maven config and local-only
exclusions. Existing edits in the three relevant tracked documents were retained
and extended; IMPLEMENTATION_PLAN.md remains locally excluded/untracked.

The complete suite, migration compatibility suites, live-server/network HTTP,
Tasks 4-5 target behavior and development/production deployment were not run or
verified. smart_lims_db was not accessed. No Postman artifacts, commits, pushes,
branch switches, new migrations or changes to applied migrations were made.


## Task 4 catalog list filtering verification (2026-10-28)

Scope: Stage 1 Task 4 only; R-CAT-01/R-NFR-01, S1-CAT-R02/R03/R04;
depends on DONE Tasks 2-3. GET /api/lab-tests accepts one exact category
identifier. A correlated EXISTS predicate combines membership, literal search
and effective availability before pagination/counting, preserving one row per
test and every assigned category in the response. PATIENT omission/active=true
lists active tests only; well-formed active=false returns 403 after supported
query syntax validation. Staff retain either availability state. Unknown query
keys remain ignored. Task 5 detail visibility/catalog completion remains TODO;
no detail-endpoint policy change is included.

Before testing, reverified the independent disposable PostgreSQL 16.15 cluster:
inspected the saved temporary data directory, postmaster files, postgresql.conf
and pg_hba.conf. pg_ctl confirmed PID 17864 running that directory, and a separate
listener inspection matched 127.0.0.1:55432 to that process. An explicit psql
connection to smartlims_auth_regression confirmed current_database, postgres user,
loopback server address/port, listen_addresses=127.0.0.1, and the exact temporary
data directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df. No startup or cluster
configuration change was needed. The unchanged excluded .mvn/maven.config and
Surefire mapping selected jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression.
No smart_lims_db connection or application datasource fallback was used.
Management fixtures use synthetic data, fake VerificationEmailSender and truncate
only the guarded regression database. No compatibility databases were created.
Flyway validated all six existing migrations, reported V6 current and no migration
necessary; Hibernate schema validation succeeded.

Exact command, from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestRequestTest,LabTestServiceTest,LabTestErrorHandlerTest,LabTestManagementTest' test
```

Result: **32 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished **2026-10-28 17:14:25 +02:00**, total Maven time **35.013 seconds**.
This was one successful focused invocation; no rerun or complete-suite execution.

| Suite | Passing cases | Evidence |
|---|---:|---|
| LabTestRequestTest | 6 | Existing DTO/JSON/query validation; all seven exact enum query identifiers accepted; omission and ignored plural key; invalid/blank/padded/lowercase/label/comma-separated and repeated category rejected |
| LabTestServiceTest | 7 | Existing write/identifier/constraint checks; PATIENT active=false rejected directly at the service boundary before repository access, with existing forbidden envelope semantics; missing authentication rejected |
| LabTestErrorHandlerTest | 4 | Existing validation envelope, matching request ID, no-store, JSON and method/content-type behavior |
| LabTestManagementTest | 15 | Five new list cases plus ten existing assignment/security/catalog regressions (the former patient inactive-list success assertion updated to the finalized 403 rule). Real PostgreSQL plus MockMvc/security verifies membership under either assigned category with full arrays; all seven filter values; no duplicates/inflated totals; unfiltered uncategorized inclusion and named-filter exclusion; combined case-insensitive trimmed name/code search and availability; count/pagination across equal-name/price UUID ties in both sort directions and code-desc sorting; ordinary and Integer.MAX_VALUE distant pages retain filtered totals; empty-page metadata; literal %, _ and backslash; blank search; every role via bearer and cookie with omitted/true/false active and optional category; unknown-key bypass attempts; missing/invalid authentication; invalid/repeated syntax for every supported query key, including 400 precedence over the patient inactive-list policy, fieldErrors, no-store and matching request ID. Existing ADMIN writes and cookie CSRF checks pass. |

Final review: git diff --check passed; all seven catalog JSON examples parsed.
Pre-task SHA-256 comparisons confirm unrelated files, V1-V6, entity/category mapping,
request/response assignment DTOs, mapper, controller/repository/error handling,
security, POM, database guard, local Maven mapping and local exclusions unchanged.
Relevant API/design/test documentation and the excluded local implementation plan
were updated without changing historical run results. Task 4 is DONE; Task 5 TODO.

Not run/verified: complete backend suite, migration compatibility suites, live
network HTTP server, Task 5 inactive-detail restrictions/final stage completion,
and development/production deployment readiness. No smart_lims_db access, new or
modified applied migrations, Postman files, commits, pushes or branch changes.
