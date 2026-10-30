# Patient linking V5: manual development database reconciliation

Migration-version references in historical sections describe the original V1-V9
implementation. The current application uses canonical V1-V24 from
`src/main/resources/db/migration`; the earlier V1-V9 SQL remains only in test
fixtures for compatibility coverage. See [MIGRATION_LINEAGES.md](MIGRATION_LINEAGES.md).
This reconciliation procedure is legacy-only and must never target the new lineage.

This is a retained operator procedure for an exact legacy history, not a pending action for every checkout. Saved private operator artifacts record development reconciliation completed on 2026-10-26, including restored-backup verification, unchanged business rows and normal-order validation; see [database evidence and limits](DATABASE_DESIGN.md#11-implemented-migrations-and-recorded-reconciliation). This documentation review accessed files only and did not connect to a database or rerun the procedure.

Do not rerun history reclassification on a database already using canonical V4 lab/V5 linking identities. For another environment, first establish its exact history and obtain separate authorization with a verified backup. Source preparation, tests and this runbook do not authorize database writes. T-MIG-01 and D-OPS in the [SDLC index](../IMPLEMENTATION_PLAN.md) distinguish the completed historical recovery from outstanding environment inventory.

The canonical migration files are:

1. `V1__auth_foundation.sql`
2. `V2__password_reset_attempts.sql`
3. `V3__patients.sql`
4. `V4__lab_tests.sql` (unchanged from main)
5. `V5__patient_link_tokens.sql` (byte-identical SQL to the former linking V4)

The pre-recovery development history had V4 linking, checksum `504398204`, a `patient_link_tokens` table, no `lab_tests` table, and no V5 history. This procedure applies only to that exact legacy state. A database already using main's V4 lab migration can apply a missing V5 normally; do not reclassify its V4 row. A database already at canonical V1-V5 needs no reconciliation.

## 1. Stop writers and prepare tools

Stop every backend instance/job using this database and disconnect IDE database consoles and other clients. Keep them stopped until final validation succeeds. Do not terminate sessions automatically. Inventory other team environments separately.

Run these commands manually in PowerShell from `Backend`, using PostgreSQL 16 tools. Adjust host/port only to the confirmed development target. Supply the existing database owner/DBA username; `--password` prompts privately and does not put a password in commands or Git. The operator needs database ownership, migration privileges, visibility of connected sessions, and permission to create the temporary restore-check database.

```powershell
$ErrorActionPreference = 'Stop'
$PgBin = 'C:\Program Files\PostgreSQL\16\bin'
$DbHost = 'localhost'
$DbPort = 5432
$DbName = 'smart_lims_db'
$DbOwner = Read-Host 'Existing database owner/DBA username'
$BackupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Smart-LIMS-DB-Backups'
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupFile = Join-Path $BackupRoot ($DbName + '-before-v5-' + $Stamp + '.dump')
$HistoryBefore = Join-Path $BackupRoot ('flyway-before-' + $Stamp + '.csv')

.\mvnw.cmd clean '-DskipTests' package
if ($LASTEXITCODE -ne 0) { throw 'Build failed; stop.' }
```

`clean` matters: a normal incremental build can retain the removed V4 linking resource under `target/classes`. Do not manually edit generated output. The JAR must contain the five canonical files, with no `V4__patient_link_tokens.sql`.

## 2. Inspect and back up without changing the source database

```powershell
& "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $DbName --set ON_ERROR_STOP=1 --command `
  "SELECT current_database(); SELECT version,script,checksum,success FROM public.flyway_schema_history ORDER BY installed_rank; SELECT to_regclass('public.lab_tests'),to_regclass('public.patient_link_tokens');"
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed; stop.' }

& "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $DbName --set ON_ERROR_STOP=1 --csv --output $HistoryBefore --command `
  'SELECT * FROM public.flyway_schema_history ORDER BY installed_rank'
if ($LASTEXITCODE -ne 0) { throw 'History snapshot failed; stop.' }

& "$PgBin\pg_dump.exe" --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $DbName --format=custom --file $BackupFile
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; stop.' }

& "$PgBin\pg_restore.exe" --list $BackupFile > ($BackupFile + '.manifest.txt')
if ($LASTEXITCODE -ne 0) { throw 'Backup archive cannot be read; stop.' }
Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256 |
  Format-List | Out-File -LiteralPath ($BackupFile + '.sha256.txt')
```

Expected versioned history before recovery:

| Version | Script | Checksum |
|---|---|---|
| 1 | V1__auth_foundation.sql | -1352466631 |
| 2 | V2__password_reset_attempts.sql | 648022465 |
| 3 | V3__patients.sql | 1840101235 |
| 4 | V4__patient_link_tokens.sql | 504398204 |

All four rows must be successful SQL migrations. Stop on any difference. The dump contains sensitive application data; keep it in an approved private backup location outside Git. Reading its manifest alone is not a restore test.

## 3. Verify the backup by restoring into a new database

This creates a separately named disposable copy; it does not restore over `smart_lims_db`. It also contains sensitive data and must remain private. No application/tests should connect to the copy.

```powershell
$RestoreCheckDb = 'smartlims_backup_check_' + [guid]::NewGuid().ToString('N')
if ($RestoreCheckDb -notmatch '^smartlims_backup_check_[0-9a-f]{32}$') { throw 'Invalid restore-check name.' }

& "$PgBin\createdb.exe" --host $DbHost --port $DbPort --username $DbOwner --password `
  --template template0 $RestoreCheckDb
if ($LASTEXITCODE -ne 0) { throw 'Restore-check database creation failed; stop.' }

& "$PgBin\pg_restore.exe" --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $RestoreCheckDb --exit-on-error --no-owner --no-privileges $BackupFile
if ($LASTEXITCODE -ne 0) { throw 'Backup restore failed; stop and investigate the copy.' }

$CountSql = 'SELECT (SELECT count(*) FROM public.users),(SELECT count(*) FROM public.patients),(SELECT count(*) FROM public.patient_link_tokens),(SELECT count(*) FROM public.flyway_schema_history)'
$SourceCounts = & "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $DbName --set ON_ERROR_STOP=1 -At --command $CountSql
if ($LASTEXITCODE -ne 0) { throw 'Source row-count check failed.' }
$RestoredCounts = & "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $RestoreCheckDb --set ON_ERROR_STOP=1 -At --command $CountSql
if ($LASTEXITCODE -ne 0) { throw 'Restored row-count check failed.' }
if (($SourceCounts -join '') -ne ($RestoredCounts -join '')) { throw 'Backup verification counts differ; stop.' }

& "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $RestoreCheckDb --set ON_ERROR_STOP=1 --command `
  'SELECT version,script,checksum,success FROM public.flyway_schema_history ORDER BY installed_rank'
if ($LASTEXITCODE -ne 0) { throw 'Restored history verification failed; stop.' }
```

Verify that the restored history matches the saved preflight history. A full archive restore plus these counts/history checks is the minimum backup rehearsal for this operation. It does not restore cluster-wide roles; the original procedure changes no roles or grants. Retain the backup and history snapshot.

## 4. Reclassify only the legacy linking history row

**This is the first source-database write. Run it only after explicit approval and verified backup.** The source-file renumbering approval does not authorize this database operation.

```powershell
& "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $DbName --set ON_ERROR_STOP=1 --set "expected_database=$DbName" `
  --single-transaction --file '.\src\test\resources\db\fixtures\reconcile-patient-linking-v4-to-v5.sql'
if ($LASTEXITCODE -ne 0) { throw 'Reconciliation aborted/rolled back; keep the application stopped.' }
```

The [reviewable SQL fixture](../src/test/resources/db/fixtures/reconcile-patient-linking-v4-to-v5.sql) is kept outside Flyway migration locations and is never run automatically at application startup. It uses transaction-local timeouts, locks the history table and patient tables, checks the database name, checks other connected clients, requires the exact four original identities/checksums, and refuses an existing lab table or V5 history. It changes exactly one row:

```sql
UPDATE public.flyway_schema_history
SET version = '5', script = 'V5__patient_link_tokens.sql'
WHERE version = '4' AND script = 'V4__patient_link_tokens.sql'
  AND checksum = 504398204 AND success AND type = 'SQL';
```

Run the guarded file, not this explanatory excerpt. Checksum, installed rank/time/user, description, execution time, and application rows remain unchanged. No migration SQL is rerun. A second execution deliberately fails its preconditions.

## 5. Apply main's missing V4 exactly once

Use the clean-built JAR and the normal, securely supplied runtime credentials/JWT configuration. The app's existing `DB_USERNAME`, `DB_PASSWORD`, and `AUTH_JWT_SECRET_BASE64` must already be configured; do not paste or commit their values. The application database role must own/have DDL rights to the affected schema/history. This command does not expose their values. The explicit datasource URL prevents accidentally using a test/default target.

```powershell
$DevelopmentJdbcUrl = "jdbc:postgresql://${DbHost}:$DbPort/$DbName"
& java -jar '.\target\smart-lims-0.0.1-SNAPSHOT.jar' `
  '--spring.main.web-application-type=none' `
  "--spring.datasource.url=$DevelopmentJdbcUrl" `
  '--spring.flyway.out-of-order=true' `
  '--spring.flyway.validate-on-migrate=true' `
  '--spring.jpa.hibernate.ddl-auto=validate'
if ($LASTEXITCODE -ne 0) { throw 'Migration/validation failed; keep writers stopped and investigate.' }
```

This starts a non-web application context, applies the missing `V4__lab_tests.sql`, and exits. It must not invoke the separate first-administrator provisioning command. V5 is already recorded with its original checksum, so the existing linking table is not recreated. Use the out-of-order flag only on this one command; do not put it in application YAML, persistent environment, or normal launch settings.

## 6. Validate with normal ordering and confirm retained data

```powershell
& java -jar '.\target\smart-lims-0.0.1-SNAPSHOT.jar' `
  '--spring.main.web-application-type=none' `
  "--spring.datasource.url=$DevelopmentJdbcUrl" `
  '--spring.flyway.out-of-order=false' `
  '--spring.flyway.validate-on-migrate=true' `
  '--spring.jpa.hibernate.ddl-auto=validate'
if ($LASTEXITCODE -ne 0) { throw 'Normal validation failed; keep the application stopped.' }

& "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $DbName --set ON_ERROR_STOP=1 --command `
  'SELECT installed_rank,version,script,checksum,success FROM public.flyway_schema_history WHERE version IS NOT NULL ORDER BY version::integer; SELECT count(*) AS lab_tests FROM public.lab_tests'
if ($LASTEXITCODE -ne 0) { throw 'Final history/schema check failed.' }

$FinalCounts = & "$PgBin\psql.exe" -X --host $DbHost --port $DbPort --username $DbOwner --password `
  --dbname $DbName --set ON_ERROR_STOP=1 -At --command `
  'SELECT (SELECT count(*) FROM public.users),(SELECT count(*) FROM public.patients),(SELECT count(*) FROM public.patient_link_tokens)'
if ($LASTEXITCODE -ne 0) { throw 'Final data check failed.' }
if (($FinalCounts -join '') -ne (($SourceCounts -join '') -replace '\|[0-9]+$','')) {
  throw 'Application row counts changed; keep the application stopped and investigate.'
}
```

Expect V4 `V4__lab_tests.sql` and V5 `V5__patient_link_tokens.sql`, all successful. V5 checksum must still be `504398204`. V5 retains the legacy installed rank (normally 4), while V4 is installed afterward (normally rank 5); that is expected for the one-time out-of-order recovery. Do not renumber installed ranks or rely on the final migration log's version label. User/patient/token counts must match the pre-backup values; the new lab table starts empty.

Only then restart normal application writers, with out-of-order disabled. Retain the backup. After the agreed retention/recovery checks, the operator may remove only the uniquely named restore-check database, with the same name guard and `dropdb --interactive`; never substitute `smart_lims_db`.

If step 4 fails, its transaction rolls back. If step 5 or 6 fails after step 4 committed, keep the app stopped and preserve the backup/history snapshots for investigation. Do not delete history rows, relabel V4 as lab SQL without running it, run a generic repair to hide checksums, enable schema auto-update, or restore over the source database automatically. Prefer rehearsing recovery into another fresh database.
