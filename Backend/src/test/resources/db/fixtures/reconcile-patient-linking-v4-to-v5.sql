-- Manual maintenance script; never part of automatic Flyway startup.
-- Follow docs/PATIENT_LINKING_V5_RECONCILIATION.md, including explicit write
-- approval and a verified backup, before using it outside disposable tests.
-- Run with psql --single-transaction --set ON_ERROR_STOP=1
-- --set expected_database=<confirmed database>. JDBC callers must also supply
-- the expected database and execute the whole file in one transaction.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('smartlims.expected_database', :'expected_database', true);

DO $reconciliation$
DECLARE
    changed_rows integer;
BEGIN
    IF current_database() IS DISTINCT FROM current_setting('smartlims.expected_database', true) THEN
        RAISE EXCEPTION 'Connected database does not match expected_database.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND backend_type = 'client backend'
    ) THEN
        RAISE EXCEPTION 'Other clients are connected; stop writers and disconnect clients first.';
    END IF;

    LOCK TABLE public.flyway_schema_history IN ACCESS EXCLUSIVE MODE;
    LOCK TABLE public.users, public.patients, public.patient_link_tokens IN ACCESS EXCLUSIVE MODE;

    IF to_regclass('public.lab_tests') IS NOT NULL THEN
        RAISE EXCEPTION 'A lab_tests table already exists; this is not the expected legacy schema.';
    END IF;

    IF (SELECT count(*) FROM public.flyway_schema_history) <> 4
       OR (SELECT count(*) FROM public.flyway_schema_history
           WHERE type = 'SQL' AND success
             AND (version, script, checksum) IN (
                 ('1', 'V1__auth_foundation.sql', -1352466631),
                 ('2', 'V2__password_reset_attempts.sql', 648022465),
                 ('3', 'V3__patients.sql', 1840101235),
                 ('4', 'V4__patient_link_tokens.sql', 504398204)
             )) <> 4 THEN
        RAISE EXCEPTION 'Migration history does not match the four reviewed legacy identities and checksums.';
    END IF;

    UPDATE public.flyway_schema_history
    SET version = '5', script = 'V5__patient_link_tokens.sql'
    WHERE version = '4' AND script = 'V4__patient_link_tokens.sql'
      AND checksum = 504398204 AND success AND type = 'SQL';

    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one legacy linking history row to change.';
    END IF;
END
$reconciliation$;
