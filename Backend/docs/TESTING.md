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


## Task 5 detail and catalog completion verification (2026-10-28)

Scope: Stage 1 Task 5 only, including the requested Tasks 1-4 acceptance review;
R-CAT-01/R-NFR-01, S1-CAT-R01/R02/R03/R04, with DONE Tasks 1-4 and resolved
S1-CAT-D01/D02. The existing detail DTO already contains all twelve documented
fields and ordered category arrays. LabTestService now returns the existing
LAB_TEST_NOT_FOUND error for an inactive test requested by PATIENT before mapping
its fields/categories. Missing and inactive errors have the same message and
empty fieldErrors, with no detail fields. Staff retain inactive access. Writes,
list filtering, authentication, cookie CSRF and applied migrations are unchanged.

Independently reverified isolation before execution: inspected the saved temporary
data directory, postmaster files, postgresql.conf and pg_hba.conf; pg_ctl reported
the same dedicated running cluster (PID 17864), independently matched to the
127.0.0.1:55432 listener. Explicit psql confirmed PostgreSQL 16.15, database
smartlims_auth_regression, postgres user, loopback server/listen_addresses and
matching temporary data_directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df. The unchanged excluded
local Maven configuration/Surefire mapping selected that guarded target. The
existing guard and all test datasource paths were reviewed; application defaults
were never a fallback. No startup/configuration change or smart_lims_db access.
Fixtures use synthetic data and fake email. Compatibility suites create/drop only
their own smartlims_migration_<32 hex characters> databases on that same cluster.
There were zero owned migration databases before and after execution. Post-run
read-only checks confirmed all regression database migrations successful through V6.

Focused command, from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestServiceTest,LabTestManagementTest,LabTestErrorHandlerTest' test
```

Result: **30 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished **2026-10-28 18:37:07 +02:00**, Maven time **46.891 seconds**.
Service 8, management 18, error-handler 4. New coverage verifies all twelve detail
fields, UTC timestamps matching persistence, omitted/null optional text, zero/one/
multiple ordered categories, exact field allowlist, all roles via bearer/cookie,
active uncategorized detail access, patient inactive categorized/uncategorized
404 indistinguishable from missing (except request ID), query-key bypass attempts,
staff inactive access, reactivation visibility, missing/malformed/noncanonical IDs,
uppercase canonical UUIDs, authentication precedence and missing/invalid tokens.
The service unit check verifies rejection before mapper interaction. Existing
create/update/status, ADMIN-only writes, list filters and cookie CSRF regressions
pass. The existing cookie test now expects patient 404 if its prior ADMIN iteration
deactivated that fixture. A subsequent type-only test cleanup removed an unchecked
Map assignment; no production behavior changed after this focused run.

After focused checks passed, executed the complete suite exactly once:

```powershell
.\mvnw.cmd test
```

Result: **163 tests across 19 suites, 1 failure, 0 errors, 0 skips; BUILD FAILURE**,
exit 1, finished **2026-10-28 18:38:58 +02:00**, reported time **1 minute 12 seconds**.
All six catalog suites (43 cases) and both migration compatibility suites (10 cases,
including the four catalog migration cases) passed. The only failure was
PatientManagementTest.databaseEnforcesUniqueNumbersLinksGenderAndRetainedUserReferences:
its exact history expectation still ended at V5, while Task 2 correctly introduced
V6__lab_test_categories.sql. This was a Stage 1 verification-maintenance gap,
not a patient behavior failure. Updated that exact expected version list to V1-V6
and added an exact V6 script-name assertion; all existing patient uniqueness,
gender and retained-reference assertions remain. No production or applied migration
file changed to resolve the failure. No unrelated failure was found.

Reran only the affected suite:

```powershell
.\mvnw.cmd '-Dtest=PatientManagementTest' test
```

Result: **27 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished **2026-10-28 18:40:07 +02:00**, Maven time **29.220 seconds**.
The other 136 cases passed in the single full invocation. Final evidence therefore
covers **163 distinct passing cases across the full run and targeted rerun**.
The latest per-suite reports aggregate to 163/0/0/0 but originate from those two
invocations; this is not a single green complete-suite result. The complete suite
was not rerun after the history assertion fix, honoring the requested one full run.

| Final suite group | Passing cases | Evidence origin |
|---|---:|---|
| Six catalog suites | 43 | Single full run: request 6, service 8, error-handler 4, management 18, category persistence 3, category migration 4 |
| Authentication/provisioning/security/password suites | 55 | Single full run |
| Patient management | 27 | Targeted rerun after strict V6 history correction |
| Other patient/linking/request/migration suites | 37 | Single full run; includes all six patient migration compatibility cases |
| Application context | 1 | Single full run |

Tasks 1-4 acceptance review: the finalized fixed vocabulary/static discovery,
optional category/legacy handling, V6 integrity/index/mapping design, array
validation/replacement/status semantics, unique membership filtering with combined
literal search/pagination/counts, patient list policy and staff access are retained.
Fresh/upgrade/preservation and category constraint/concurrency checks passed in
the full run. The sole stale history assertion was corrected as above. No remaining
functional catalog gap or unresolved clinical/product decision was identified.

Task 5 implementation/verification is DONE. Stage technical acceptance is DONE
with the cumulative evidence above. Overall stage status remains IN_PROGRESS
solely because the plan separately requires a commit and the user explicitly
instructed not to commit. No commit, push or branch switch was performed.
Documentation, git diff --check and all seven catalog JSON examples were checked;
pre-task hashes preserve unrelated files, V1-V6, security, controller/repository/
DTO/mapper/query code, POM, isolation guard, machine-local Maven mapping and local
exclusions. The local implementation plan remains excluded/untracked.

Not verified: one green combined full invocation after the history assertion fix,
live network HTTP server/client integration, development/production migration or
deployment readiness. No development data was accessed or clinical mapping inferred.
No Postman artifacts, future workflow modules, new migrations or applied migration
changes. Committing is intentionally pending; no future stage was started.

## Task 7 order persistence verification (2026-10-28)

Scope: Stage 2 Task 7, R-ORD-01/R-NFR-01; storage support for S2-ORD-R03/R04/R05
under ORDERS_API.md and DATABASE_DESIGN.md sections 4.7-4.8. Reviewed the linked
my-orders.jpeg reference. Added V7__orders.sql, TestOrder/OrderItem/OrderStatus,
TestOrderRepository and the catalog shared snapshot-lock lookup. No order
controller/service/DTO or new HTTP behavior is implemented.

Before database execution, independently confirmed PostgreSQL 16.15 using psql,
the loopback listener, process command line, and the saved disposable data path:

- Target: jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression,
  user postgres, empty test-only password.
- Listener 127.0.0.1:55432, postgres PID 17864; actual data_directory and its
  process -D both matched
  C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
- The development Windows service was separate (PID 5788), using
  C:/Program Files/PostgreSQL/16/data; it was not a test target.
- Migration cases created/dropped only their own guarded
  smartlims_migration_<32 lowercase hex> databases on that disposable instance.
  Fixtures were synthetic; external email was mocked. Maven's local URL mapping,
  Surefire mapping and IsolatedPostgresTest guard were preserved.

Commands ran directly from Backend on branch backend-hmood:

```powershell
.\mvnw.cmd '-Dtest=OrderMigrationTest,OrderPersistenceTest' test
```

**14 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 21:56:01 +02:00, Maven time 48.157 seconds.
OrderMigrationTest: 7; OrderPersistenceTest: 7, including three enum cases.

```powershell
.\mvnw.cmd '-Dtest=LabTestCategoryMigrationTest,PatientMigrationCompatibilityTest,PatientManagementTest' test
```

**37 tests, 0 failures, 27 fixture errors, 0 skips; BUILD FAILURE**, exit 1,
finished 2026-10-28 21:57:41 +02:00, Maven time 35.764 seconds.
Both migration suites passed (4 category + 6 patient compatibility cases).
PatientManagementTest's 27 errors all originated before the test bodies:
PostgreSQL rejected TRUNCATE of patients/users because test_orders now references
them (SQLSTATE 0A000). Updated the explicit fixture table lists in the five
affected authentication/patient/catalog suites to include order_items/test_orders.
No CASCADE, assertion removal, isolation-guard change or production behavior
change was used. Existing exact migration-history/count assertions now include V7
and its script name; earlier checksum and preservation assertions remain.

```powershell
.\mvnw.cmd '-Dtest=RegistrationTest,AuthenticationRegressionTest,PatientManagementTest,PatientProfileLinkingTest,LabTestManagementTest' test
```

**117 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 21:59:17 +02:00, Maven time 54.077 seconds.
Counts: registration 26, authentication regression 20, patient management 27,
patient linking 26, catalog management 18. The earlier fixture errors are resolved.

Task 7 acceptance evidence:

| Criterion | Current execution evidence |
|---|---|
| Orders/items persist and reload | JPA flush/clear/reload verifies IDs, lazy relationships, unlinked profile support, PENDING defaults, timestamps, CHAR hash/currency, retry lookup, all four stored states and cancellation metadata. Hibernate ddl-auto=validate passes. |
| Constraints enforce the design | Direct SQL verifies NOT NULL, number/hash/state/currency checks, cancellation consistency/reason/time, item code/name/finite nonnegative price bounds, unique numbers/actor keys/item membership and retained FKs. Nine order/item indexes and the independent BIGINT sequence are inspected. Concurrent same-actor/key writes leave one winner. |
| Fresh migration and upgrade preserve data | Fresh V1-V7 migration/validation and no-op rerun pass. V6-to-V7 compares complete JSON rows from all six preexisting application tables and complete prior Flyway metadata unchanged; existing patient sequence value is preserved. New order tables start empty and the order sequence starts at 1. Earlier V4/legacy compatibility cases also pass through V7. |
| Focused migration/persistence tests pass | Both new suites pass all 14 cases on the independently verified isolated target. Catalog changes and cancellation retain snapshots/items/keys; 100 maximum prices sum exactly to 999999999999.00 in Java and JPQL. Failed item insertion rolls back the header/items/key, permitting a subsequent retry. Repository lock modes are exercised. |

Current evidence covers **141 distinct passing tests across nine suites** from
the three scoped invocations above, with the failed fixture invocation and its
correction explicitly retained. This is not a complete-suite run. Git diff review
and git diff --check passed. V1-V6, dependencies, security, Maven configuration,
the test isolation guard and local exclusions are unchanged. The preexisting
order-contract/database-design work is retained and updated for persistence status.
The local plan remains excluded; no files were staged or committed.

Task 7 is DONE. Tasks 8-11 remain TODO: service-level bounded/nonempty aggregate
validation, active catalog admission, authorization/ownership, canonical request
hash construction, retry recovery in fresh transactions, cancellation semantics
and HTTP/query behavior remain later work. SQL rollback/uniqueness and mapped
lock modes do not establish those service behaviors or full concurrency handling.
The complete suite, live HTTP, development/production migrations and deployment
were not run or claimed. No frontend, Postman artifacts, future workflow or AI
work was added.

## Task 8 order creation verification (2026-10-28)

Scope: Stage 2 Task 8; R-ORD-01/R-NFR-01, S2-ORD-R01/R04/R05 and
ORDERS_API.md sections 3-6/8-9. Reviewed the linked my-orders.jpeg reference,
patient identity/linking contract, catalog contract and storage/transaction design.
Implemented only POST /api/orders/me and POST /api/orders, validated DTOs, detail
mapping, scoped error advice, transactional creation/replay, exact security
matchers and the Idempotency-Key CORS header. V1-V7 and Task 7 mappings/repositories
are unchanged. No patient GET or cancellation endpoint is implemented.

Before execution, independently reconfirmed the disposable PostgreSQL 16.15 target
with psql, the listener, process command line and saved cluster directory:

- jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression; test-only postgres
  user and empty password. Listener 127.0.0.1:55432 belongs to postgres PID 17864.
- Actual data_directory and process -D match the saved SMARTLIMS_TEST_POSTGRES_DATA:
  C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
- The separate development service uses PID 5788 and
  C:/Program Files/PostgreSQL/16/data; it was not accessed by tests.
- Existing machine-local Maven/Surefire URL mapping and IsolatedPostgresTest guard
  remain unchanged. All data is synthetic; external email is mocked. Rollback
  injection uses a test-owned trigger/function in this isolated database only,
  removed in finally. The order sequence expansion fixture also uses this target.

All commands ran directly from Backend on backend-hmood. Initial compilation
attempts exposed a checked UnsupportedEncodingException in the new response test
helper; no tests ran in those attempts. Reading response bytes fixed the helper.

| Preliminary command | Finished (+02:00) | Maven time | Outcome |
|---|---|---|---|
| .\mvnw.cmd '-Dtest=OrderRequestTest' test | 22:55:40 | 14.928 s | exit 1, test compilation failed |
| .\mvnw.cmd '-Dtest=OrderRequestTest' test | 22:56:14 | 14.261 s | exit 1, test compilation failed; the Charset overload also declared the checked exception |
| .\mvnw.cmd '-Dtest=OrderCreationTest' test | 22:57:02 | 9.487 s | exit 1, same helper compilation error before the byte-based correction |

Focused request/creation execution:

```powershell
.\mvnw.cmd '-Dtest=OrderRequestTest,OrderCreationTest' test
```

**26 tests, 0 failures, 2 errors, 0 skips; BUILD FAILURE**, exit 1,
finished 2026-10-28 22:57:53 +02:00, Maven time 38.437 seconds.
OrderRequestTest passed all 4 cases; OrderCreationTest passed 20 of 22 cases.
Both errors were new test setup: the CSRF endpoint returns its token in the
XSRF-TOKEN cookie, not a JSON token property; the derived Spring Data query is
abstract and cannot be used with Mockito doCallRealMethod. Corrected the cookie
lookup and forced-missed-precheck fixture. No production code or assertions were
weakened. Added one current-eligibility case for disabled, unverified, passwordless
and unaccepted-invitation accounts through both HTTP and direct service calls.

Reran only the two affected cases and the new eligibility case:

```powershell
.\mvnw.cmd '-Dtest=OrderCreationTest#cookieWritesRequireCsrfAndBearerTakesPrecedence+uniqueCollisionRollsBackBeforeWinnerLookupInANewTransaction+creationRejectsEveryIneligibleAccountStateUsingCurrentStoredData' test
```

**3 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 23:00:34 +02:00, Maven time 29.184 seconds.
The collision test forces one missed precheck, then executes the real PostgreSQL
unique violation/rollback and a real winner read in the fresh replay transaction.
It verifies both proxied transaction names and the unchanged complete winner.
The query precheck is spied for this case only; normal/concurrent request tests
use the real repository. Current evidence is **27 distinct passing new cases**
(23 creation + 4 request), accumulated across the initial run and targeted rerun;
no single green 27-case invocation is claimed. The latest creation XML contains
only the targeted three cases; it does not represent the earlier twenty passes.

Affected regression execution:

```powershell
.\mvnw.cmd '-Dtest=AuthenticationRegressionTest,BrowserSecurityTest,PatientProfileLinkingTest,LabTestManagementTest' test
```

**67 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 23:02:20 +02:00, Maven time 40.134 seconds.
Counts: authentication 20, browser security 3, patient linking 26, catalog 18.
Existing tests were not edited. Total current Task 8 evidence is **94 distinct
passing cases across six suites** from scoped invocations, not a full-suite run.

Task 8 acceptance evidence:

| Criterion | Execution evidence |
|---|---|
| Complete orders without partial writes | Patient and both staff roles create PENDING aggregates for linked/unlinked existing profiles with retained actors, IDs, exact item count and snapshots. Missing/inactive selections leave no header/items. A forced failure on the final item rolls back earlier items, header and retry key, then the original key successfully retries. |
| No trusted client identity, prices or status | Separate self/staff DTOs reject unknown patientId/userId, price/currency/total/status/actor and future-workflow fields. Strict JSON rejects scalar coercion and incorrect containers/elements. Self creation uses the authenticated account's locked profile; absence yields PATIENT_PROFILE_NOT_LINKED with no automatic creation/link. Staff must select an existing profile. |
| Validation and authorization | Real signed JWTs exercise both role matrices; direct service calls recheck stored roles/eligibility rather than trusting authorities alone. Required/null/blank/malformed UUIDs, duplicates including case variants, 1-100 bounds, missing/padded/comma/repeated retry headers and wrong JSON types return the documented field/error envelope. Cookie writes require CSRF, bearer precedence is retained, anonymous requests reaching authentication return 401, and CORS allows the retry header only for configured origins. Future read/cancel routes stay denied. |
| Transactions and retries | Same actor/key/intent replays 200 without repricing or timestamp/item changes; different intent conflicts, new keys create intentional repeats and different actors have independent namespaces. Canonical SHA-256 bytes are checked against the documented JSON shape. Replays return stored processing/completed/cancelled state while retaining cancellation history. Role/eligibility/link changes are rechecked. Concurrent matching requests produce one created order and one identical replay; conflicting requests produce one complete winner/conflict; distinct keys/actors get distinct numbers. A catalog writer blocks snapshot admission until its commit, then the new availability is honored. The real uniqueness rollback/fresh winner lookup passes. |
| Totals and response contract | Zero-priced uncategorized active tests are admitted; 100 maximum prices sum exactly to 999999999999.00. Numbering expands beyond six digits. Detail contains only documented fields, sorted snapshot items, UTC instants, ILS, canCancel and visitDetailsAvailable=false; self gets Location and staff does not. |

Reviewed the diff and passed git diff --check. All changes remain inside Backend.
No applied migration, dependency, authentication strategy, isolation guard or
local exclusion was changed; local planning files remain excluded. No Postman
artifacts, frontend changes, commit, push or deployment were made.

Task 8 is DONE with no remaining acceptance gap. Tasks 9-11 remain TODO for
patient list/detail, cancellation and complete-stage verification. Historical
Task 7 migration/persistence checks were not rerun. The complete suite, live
network HTTP server, manual Postman checks and development/production execution
were not run or claimed; HTTP evidence is MockMvc with real security and the
verified isolated PostgreSQL database.

## Task 9 patient order read verification (2026-10-28)

Scope: R-ORD-01/R-NFR-01; S2-ORD-R02/R04. Implemented patient-only
GET /api/orders/me and GET /api/orders/me/{id}, validated query DTOs, ownership
specification/lookup, page summaries, batched grouped item totals and read-only
service mapping. Reviewed ORDERS_API.md, DATABASE_DESIGN.md sections 4.7-4.8,
patient identity/catalog contracts and my-orders.jpeg. Prior Task 8 working-tree
changes were preserved. Task 10 had not started during this verification.

Independently reconfirmed the isolated PostgreSQL 16.15 instance before testing:
jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression, test-only postgres
user/empty password. The listener belongs to PID 17864; psql data_directory,
the process -D and saved SMARTLIMS_TEST_POSTGRES_DATA agree on
C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
The development service remains separate, PID 5788, using
C:/Program Files/PostgreSQL/16/data. No development database was tested.
Synthetic fixtures and mocked email only; existing Maven URL mapping, Surefire
mapping and isolation guard are unchanged.

Commands executed directly from Backend on backend-hmood:

```powershell
.\mvnw.cmd '-Dtest=OrderQueryRequestTest,OrderReadTest,OrderCreationTest#creationAndPatientReadsHaveExactRolesWhileOtherRoutesStayDenied' test
```

Result: **15 tests, 1 failure, 0 errors, 0 skips; BUILD FAILURE**, exit 1,
finished 23:35:02 +02:00, Maven time 53.121 seconds. Query validation (4) and
updated creation/read role boundary (1) passed; reads passed 9 of 10 cases.
The maximum-page case found Spring Page.isLast overflow at page 2147483647.
Order page mapping now computes last using long arithmetic; totals/content
were already correct. No assertion was weakened.

```powershell
.\mvnw.cmd '-Dtest=OrderReadTest' test
```

First rerun: **10 tests, 0 failures, 10 errors, 0 skips; BUILD FAILURE**,
exit 1, finished 23:36:26 +02:00, Maven time 42.355 seconds. Before test bodies,
Spring's classpath scan reported NoSuchFileException for generated
target/classes/com/smartlims/orders/mapper and scanned only five repositories,
so TestOrderRepository could not be injected. An IntelliJ build process was
active; concurrent generated-output rebuilding is the inferred cause. The
mapper/repository classes were present again before retry. No generated file,
IDE setting or build configuration was manually changed.

Same focused command retried: **10 tests, 0 failures, 0 errors, 0 skips;
BUILD SUCCESS**, exit 0, finished 23:37:25 +02:00, Maven time 32.259 seconds.
Together with the four query cases and role case from the first run, all
**15 distinct focused cases pass cumulatively**; no single green 15-case run
is claimed. Latest read reports contain the ten corrected passing cases.

Acceptance evidence:

- Unique owned results/counts and original item totals pass with multiple items
  per order and other-patient/unlinked orders excluded. All four statuses combine
  with literal case-insensitive order-number-only search before paging/counts;
  percent, underscore and backslash remain literal. Every supported query's
  repetition/syntax/bounds and every documented sort/direction are checked.
- UUID ascending ties, page navigation, empty pages/filters, page 2147483647 and
  filtered totals/first/last metadata pass. One hundred maximum-price snapshots
  retain exact 999999999999.00 totals in summary and detail.
- Patient ownership uses the profile/account link even for staff-created orders;
  another patient's orders/missing/unlinked detail all use ORDER_NOT_FOUND.
  Query patientId/userId cannot override ownership. Newly linked historical staff
  orders become visible. Empty linked list differs from an unlinked profile.
- Catalog rename/reprice/deactivation and cancelled stored state retain item
  IDs/snapshots, prices, count and amount. Detail/summary field sets, ordering,
  cancellation metadata, canCancel and visitDetailsAvailable=false pass.
- Roles, anonymous/invalid JWT, cookie reads, bearer precedence and current stored
  role/eligibility checks pass. Exact GET matchers leave staff browsing denied.

Diff review/git diff --check passed. Task 9 is DONE; all four acceptance criteria
pass. Task 10 remains TODO at this record and will be implemented next under the
same user request. Task 11 is not started. No complete suite, deployment, live
network HTTP, manual Postman, commit or push was performed; HTTP evidence is
MockMvc with real signed JWT/security and the verified isolated PostgreSQL target.

## Task 10 order cancellation verification (2026-10-28)

Scope: R-ORD-01/R-NFR-01; S2-ORD-R03/R04/R05 and ORDERS_API.md section 7.
Task 9 was verified and marked DONE before Task 10 implementation began. Added
only POST /api/orders/{id}/cancel, a strict validated reason DTO and a service
transaction using the existing V7 cancellation fields/order write lock. Reviewed
the linked contract/design and my-orders.jpeg; no clinical or processing policy
was inferred. The same independently verified disposable PostgreSQL 16.15 cluster
from the Task 9 record was used throughout (loopback 127.0.0.1:55432,
smartlims_auth_regression; separate temporary data directory/PID 17864).
Application datasource defaults/development data were never fallback targets.
Fixtures are synthetic; external email is mocked. A test-owned failure trigger
and function are created only on that target and removed in finally.

Executed directly from Backend on backend-hmood:

```powershell
.\mvnw.cmd '-Dtest=CancelOrderRequestTest,OrderCancellationTest,OrderCreationTest#creationAndPatientReadsHaveExactRolesWhileOtherRoutesStayDenied' test
```

**19 tests, 1 failure, 0 errors, 0 skips; BUILD FAILURE**, exit 1,
finished 23:43:03 +02:00, Maven time 49.752 seconds. Reason DTO cases (3) and the
updated exact-route case (1) passed. Cancellation passed 14 of 15 cases,
including all concurrency/rollback tests. The failing case required updatedAt
not to precede cancelledAt. Added exact timestamp diagnostics and investigated
without weakening the assertion:

```powershell
.\mvnw.cmd '-Dtest=OrderCancellationTest#patientCancellationRetainsEveryOriginalItemAndRecordsServerMetadataWithOptionalReasons' test
```

**1 test, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 23:44:45 +02:00, Maven time 40.339 seconds. The failure was intermittent;
synthetic stored rows showed some event/update times equal to the microsecond.
Inspected the installed Hibernate timestamp generator, which uses a clock adjusted
to mapped precision. The inferred edge was independently rounded nanoseconds on
the event timestamp versus the ORM precision-adjusted update clock. Cancellation
now truncates its server event time to database microseconds before persistence,
preventing rounding forward beyond that later update time. No entity mapping,
schema, timestamp assertion or test isolation setting was changed.

Reran the complete affected cancellation suite:

```powershell
.\mvnw.cmd '-Dtest=OrderCancellationTest' test
```

**15 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 23:46:33 +02:00, Maven time 49.277 seconds. All cancellation cases,
including chronology, repeat equality, rollback and concurrency, passed on the
final source. Together with the earlier DTO/route cases, Task 10 covers
**19 distinct focused passing cases cumulatively**; no single green 19-case
invocation is claimed. Latest cancellation reports contain all fifteen passes.

Acceptance evidence:

- Only eligible PATIENT owners and ADMIN/RECEPTIONIST can cancel. Stored current
  role/eligibility, forged authorities, all four ineligible account conditions,
  anonymous/invalid JWT, bearer precedence, cookie CSRF and repeat authentication
  are checked. LAB_TECHNICIAN is forbidden. Existing non-cancellation status/delete
  routes remain denied. Canonical path syntax accepts uppercase UUID hex.
- Staff require a trimmed nonblank reason, including on repeats; patient omitted,
  null/blank reasons become null. Strict JSON/unknown fields, missing body,
  non-string reasons and the trimmed 1000-character bound are verified. Denied
  reason/state/ownership requests leave headers/items unchanged.
- Only PENDING becomes CANCELLED. Processing/completed states return 409 with
  unchanged data; missing, unowned and unlinked patient orders return identical
  404 semantics for all stored states. Actor and event/update times are stored;
  creation identity/timestamp, immutable items, count, amount and currency remain.
- Authorized repeats by patient or another staff actor return the same complete
  original record, including first actor/time/reason/updatedAt. A patient blank
  reason remains null even when staff later supply a valid different reason.
  Another patient cannot replay that cancellation.
- A forced update failure produces a sanitized 500, rolls back all cancellation
  metadata and preserves items; a subsequent valid retry succeeds. Cancellation
  is reflected in owned list/detail and creation retry responses with the original
  value/snapshots and canCancel=false.
- Concurrent patient/staff cancellation returns one identical retained record,
  with actor matching the winning reason. Cancellation waits for a processing
  order lock, then rejects the committed IN_PROGRESS state. It can complete while
  another transaction holds the patient write lock, confirming no inverted
  order-to-patient write lock path. No processing endpoint was added for the test.

Diff review and git diff --check passed. Task 10 is DONE; all four acceptance
criteria pass. Tasks 9/10 were implemented sequentially, with 15 and 19 distinct
focused passing cases respectively (their updated route case is shared). Existing
Task 8 working-tree work is preserved. V1-V7, dependency versions, isolation guard,
machine-local Maven/Surefire database mapping and exclusions remain unchanged.
No commit/push, Postman artifact, frontend, AI or unrelated workflow work was done.
Task 11 remains TODO and was not started: no complete-suite run or stage-wide
verification, manual Postman acceptance, deployment or production readiness is
claimed. HTTP verification uses MockMvc with real signed JWT/security and isolated
PostgreSQL, rather than a live network HTTP server.

## Task 11 full stage verification (2026-10-28)

Scope: Stage 2 patient orders, R-ORD-01/R-NFR-01 and S2-ORD-R01-R05.
Reviewed the Task 11 acceptance criteria, ORDERS_API.md, storage/transaction
design, final controller/DTO/service/repository/mapper/security code and focused
Tasks 7-10 evidence before running the complete suite. The current user request
explicitly excludes Postman, another stage and commit/push. No Postman skill,
tool, CLI, application, resource sync or artifact generation was used. Manual
client scenarios are documented as an unexecuted HTTP checklist below.

Isolation was independently verified again before this execution, beyond the URL:

- PostgreSQL 16.15, listener 127.0.0.1:55432, postgres process PID 17864.
- psql confirmed smartlims_auth_regression, current user postgres, loopback server
  address/port and actual data_directory. The empty password is test-only.
- Actual data_directory, process -D and saved SMARTLIMS_TEST_POSTGRES_DATA matched
  C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
- The development service was distinct, PID 5788, using
  C:/Program Files/PostgreSQL/16/data. It was not a test target.
- The unchanged .mvn/maven.config/Surefire mapping supplied
  jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression. The isolation guard
  was preserved. Compatibility/migration tests created/dropped only their own
  guarded smartlims_migration_* databases on this verified disposable cluster.
- Synthetic fixtures and mocked email were used. Application datasource defaults
  were never a fallback. No development/shared database migration was executed.

After the recorded focused checks had passed, ran the complete suite directly
from Backend, branch backend-hmood:

```powershell
.\mvnw.cmd test
```

Result: **236 tests across 27 suites, 0 failures, 0 errors, 0 skips;
BUILD SUCCESS**, exit 0. Finished **2026-10-28 23:55:37 +02:00**; Maven reported
**2 minutes 13 seconds**. All 27 Surefire XML reports were freshly written by
this invocation and independently sum to 236/0/0/0. This is **one green full
invocation on the final code**, rather than cumulative targeted evidence.
No failure investigation, code/test fix, targeted rerun or second complete run
was needed. Earlier focused-run failures remain documented in their own records;
they were not failures of this full invocation.

| Suite group | Suites | Passing cases |
|---|---:|---:|
| Orders: creation 23, cancellation 15, reads 10, persistence 7, migration 7, request validation 4, query validation 4, cancellation DTO 3 | 8 | 73 |
| Authentication, registration, provisioning, browser security and password/constraint policy | 7 | 55 |
| Patient management, linking, request/token and migration compatibility | 5 | 64 |
| Catalog API/service/validation/errors, category persistence and migration | 6 | 43 |
| Application context | 1 | 1 |
| Total | 27 | 236 |

Stage acceptance review:

| Acceptance | Outcome and evidence |
|---|---|
| Creation, reads, filtering, ownership and cancellation verified | PASS. All 73 order cases pass in the full invocation: patient/staff identity and role checks, linked/unlinked profiles, strict input/header validation, exact totals/snapshots, query combinations and counts, deterministic paging/sorts including maximum offsets, ownership privacy, atomic rollback, durable retry identity/recovery and cancellation concurrency/retained metadata. |
| Existing auth, patient linking and catalog remain functional | PASS. All 163 preexisting cases pass in this same invocation, including JWT/cookie/CSRF/CORS behavior, verified linking, catalog visibility/categories and legacy migration compatibility. |
| Documentation matches implementation | PASS. Reviewed all five implemented method/path mappings, access rules, request/response fields, errors, retry/locking design and tests against ORDERS_API.md. Updated current status/evidence in the plan, API contract and database design; historical focused evidence is preserved. No additional functional mismatch was identified. |
| Future workflow boundaries remain explicit | PASS. No processing/completion endpoint, arbitrary status update, staff browsing, visit link, appointment/payment/sample/result side effect or AI module is added. visitDetailsAvailable remains false; cancelled amount is historical value, not a balance/refund. |

Task 11 and Stage 2 are **DONE**, with all four acceptance criteria satisfied
by the recorded passing evidence. On 2026-10-29 the owner clarified that committing
is a separate handoff, not an acceptance criterion; the earlier completion gate
was corrected in the plan and linked documentation. This correction did not
rerun tests or change any execution result recorded above.

Owner handoff: working-tree changes remain uncommitted and the owner decides when
to commit them. No Git write/publish operation or next stage was authorized or
performed. Task/stage completion does not claim deployment readiness.

Manual HTTP scenarios — documented, not executed:

Use only synthetic accounts/data in an appropriate test environment. Prerequisites
are an eligible linked patient, a second patient, eligible ADMIN/RECEPTIONIST and
LAB_TECHNICIAN accounts, existing linked/unlinked profiles and known active test
UUIDs. Creation writes require Content-Type: application/json and exactly one
fixed canonical UUID Idempotency-Key. Bearer requests use the caller's JWT;
cookie writes instead require access_token, the XSRF-TOKEN cookie from
GET /api/auth/csrf-token and its value in X-XSRF-TOKEN. Never record raw tokens.

| Scenario | HTTP action / expected outcome |
|---|---|
| Patient creation | POST /api/orders/me with {"testIds":["<active-test-uuid>"]}. Expect 201, own linked patient, PENDING, backend snapshot/count/ILS total and Location: /api/orders/me/{id}. No patientId, price or status input. |
| Staff creation | POST /api/orders with {"patientId":"<existing-profile-uuid>","testIds":["<active-test-uuid>"]}. ADMIN/RECEPTIONIST may target an unlinked profile; expect 201 detail and no staff Location. PATIENT/LAB_TECHNICIAN receive 403. |
| Retry versus new intent | Resend as the same actor with the same key/selection: 200 same order and snapshots, including current state. Different selection or staff target with that key: 409 IDEMPOTENCY_KEY_REUSED. A new key permits a deliberate new order. |
| Input and availability | Missing/repeated/malformed key or invalid/duplicate/empty/oversized UUID selection: 400 VALIDATION_ERROR on the documented field. Client price/status/actor or other unknown properties: 400 INVALID_JSON. Missing/inactive selected tests: 409 ORDER_TEST_UNAVAILABLE with no partial order. |
| Owned list and detail | GET /api/orders/me; combine search, exact status, page, size and permitted sort once each. Expect unique owned content/accurate totals, stable UUID ties and snapshots. GET /api/orders/me/{id} returns owned detail; unknown/unowned detail returns the same 404 ORDER_NOT_FOUND. Query patientId cannot change ownership. |
| Literal search and identity absence | search=%25, search=_ and search=%5C remain literal rather than wildcard matches. An unlinked patient list receives 404 PATIENT_PROFILE_NOT_LINKED; an empty linked profile receives an empty 200 page. |
| Snapshots and visit boundary | After an authorized catalog change, existing order name/code/price/count/total remain original. visitDetailsAvailable=false for every state; no visit URI is fabricated. |
| First cancellation and repeat | POST /api/orders/{id}/cancel with {} for the owner or a trimmed nonblank reason for staff. PENDING becomes CANCELLED, retaining items/value and storing actor/time/reason. Repeat with a valid body returns the same original cancellation metadata/updatedAt; staff still require a reason. |
| Rejected cancellation | Another patient's order: 404; LAB_TECHNICIAN: 403; invalid staff reason: 400. If legitimate existing IN_PROGRESS/COMPLETED records are available, cancellation returns 409 without mutation. There is no API to manufacture those processing states in this stage. |
| Transport and error envelope | Cookie write without matching CSRF: 403. Invalid/ineligible bearer authentication: 401; explicit bearer takes precedence over cookies. Check {code,message,fieldErrors,requestId}, matching X-Request-Id, and Cache-Control: no-store on API errors. |

These scenarios are a manual follow-up reference, not new execution evidence.
No HTTP client or Postman was used. Automated HTTP evidence is MockMvc with real
signed JWT/security and isolated PostgreSQL; a live network server/client flow,
real email delivery, development/production application of V7 and deployment
readiness were not verified by this run.

Only IMPLEMENTATION_PLAN.md, docs/TESTING.md, docs/ORDERS_API.md and
docs/DATABASE_DESIGN.md were edited for Task 11. Pre-task source/test/configuration
hashes were captured to preserve existing work; final comparison and diff review
confirm application/test code, V1-V7, POM, security, isolation guard and local Maven
mapping are unchanged from the start of Task 11. git diff --check passes. Existing
working-tree work and local exclusions are retained; no files were staged,
committed, pushed or deployed.
