# Database-backed test setup

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
