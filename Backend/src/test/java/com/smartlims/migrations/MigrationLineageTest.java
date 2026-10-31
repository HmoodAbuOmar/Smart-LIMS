package com.smartlims.migrations;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.*;
import java.util.regex.Pattern;
import java.util.zip.CRC32;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** Owns only newly created databases on the independently verified disposable cluster. */
class MigrationLineageTest {
    private static final String LEGACY = "classpath:db/fixtures/historical-v1-v9";
    private static final String SPLIT = "classpath:db/migration";
    private static final List<String> NAMES = List.of("users", "email_action_tokens", "password_reset_attempts",
            "patients", "lab_tests", "patient_link_tokens", "lab_test_categories", "test_orders", "order_items",
            "appointment_coordination", "appointment_types", "appointment_slots", "appointments", "appointment_reschedules",
            "test_parameters", "appointment_visit_states", "visits", "visit_items", "samples", "specimen_attestations",
            "test_results", "result_values", "result_specimens", "laboratory_events");
    private static final List<String> SEQUENCES = List.of("patient_number_seq", "order_number_seq", "visit_number_seq", "specimen_barcode_seq");
    private static final Map<String, Integer> LEGACY_CHECKSUMS = Map.of(
            "V1__auth_foundation.sql", -1352466631, "V2__password_reset_attempts.sql", 648022465,
            "V3__patients.sql", 1840101235, "V4__lab_tests.sql", -1646872382,
            "V5__patient_link_tokens.sql", 504398204, "V6__lab_test_categories.sql", 449901481,
            "V7__orders.sql", -92617618, "V8__appointments.sql", -987232945,
            "V9__results_visits_samples.sql", 1485554142);
    @TempDir Path temporary;
    private final List<String> owned = new ArrayList<>();
    private String root;

    @BeforeEach void requireGuardedRoot() {
        root = System.getenv("SMARTLIMS_TEST_DATABASE_URL");
        if (root == null || !root.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression")) {
            throw new IllegalStateException("An independently verified disposable regression database is required");
        }
    }

    private String database() throws SQLException {
        String name = "smartlims_migration_" + UUID.randomUUID().toString().replace("-", "");
        try (var c = DriverManager.getConnection(root, "postgres", ""); var s = c.createStatement()) {
            s.executeUpdate("CREATE DATABASE " + name);
        }
        owned.add(name);
        return root.substring(0, root.lastIndexOf('/') + 1) + name;
    }

    @AfterEach void removeOnlyOwnedDatabases() throws SQLException {
        for (String name : owned) {
            if (!name.matches("smartlims_migration_[0-9a-f]{32}")) throw new IllegalStateException("Unexpected database");
            try (var c = DriverManager.getConnection(root, "postgres", ""); var s = c.createStatement()) {
                s.executeUpdate("DROP DATABASE " + name);
            }
        }
    }

    private Flyway migration(String url, String location, String target) {
        var config = Flyway.configure().dataSource(url, "postgres", "").locations(location).cleanDisabled(true);
        // This suite compares the immutable split baseline with legacy V9, before later features.
        if (target == null && location.equals(SPLIT)) target = "24";
        if (target != null) config.target(target);
        return config.load();
    }

    private List<String> rows(String url, String sql) throws SQLException {
        try (var c = DriverManager.getConnection(url, "postgres", ""); var s = c.createStatement(); var r = s.executeQuery(sql)) {
            List<String> result = new ArrayList<>();
            while (r.next()) result.add(r.getString(1));
            return result;
        }
    }

    private void execute(String url, String sql) throws SQLException {
        try (var c = DriverManager.getConnection(url, "postgres", ""); var s = c.createStatement()) { s.execute(sql); }
    }

    private String resource(String path) throws Exception {
        try (var input = getClass().getResourceAsStream(path)) {
            assertNotNull(input, path);
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test void exactManifestOneTablePerFileAndOriginalFlywayChecksums() throws Exception {
        String url = database();
        var split = migration(url, SPLIT, null);
        var pending = split.info().pending();
        assertEquals(24, pending.length);
        var create = Pattern.compile("(?im)^CREATE TABLE\\s+");
        for (int i = 1; i <= 24; i++) {
            String filename = "V" + i + "__" + NAMES.get(i - 1) + ".sql";
            assertEquals(filename, pending[i - 1].getScript());
            String sql = resource("/db/migration/" + filename);
            assertEquals(i == 3 || i == 16 ? 0 : 1, create.matcher(sql).results().count(), filename);
        }
        for (var original : LEGACY_CHECKSUMS.entrySet()) {
            CRC32 crc = new CRC32();
            resource("/db/fixtures/historical-v1-v9/" + original.getKey()).lines()
                    .forEach(line -> crc.update(line.getBytes(StandardCharsets.UTF_8)));
            assertEquals(original.getValue().intValue(), (int) crc.getValue(), original.getKey());
        }
        assertEquals(9, migration(url, LEGACY, null).info().pending().length);
        assertTrue(resource("/application.yaml").contains("locations: classpath:db/migration"));
        assertNull(getClass().getResource("/db/migration/V1__auth_foundation.sql"), "Obsolete default location must not be packaged");
    }

    // pg_dump compares the complete PostgreSQL DDL, including column order/defaults,
    // named constraints, exclusion/partial indexes, sequence options, functions and triggers.
    private Path pgTool(String name) {
        String bin = System.getenv("SMARTLIMS_TEST_POSTGRES_BIN");
        if (bin == null || bin.isBlank()) throw new IllegalStateException("Set SMARTLIMS_TEST_POSTGRES_BIN to the PostgreSQL client bin directory");
        Path exe = Path.of(bin, name + (System.getProperty("os.name").startsWith("Windows") ? ".exe" : ""));
        if (!Files.isRegularFile(exe)) throw new IllegalStateException("PostgreSQL client tool missing: " + exe);
        return exe;
    }

    private String pg(String tool, String url, String... options) throws Exception {
        // URLs can only originate from database(), and carry no credentials.
        assertTrue(url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_migration_[0-9a-f]{32}"));
        var uri = java.net.URI.create(url.substring(5));
        List<String> command = new ArrayList<>(List.of(pgTool(tool).toString(), "-h", "127.0.0.1", "-p",
                Integer.toString(uri.getPort()), "-U", "postgres", "-w", "-d", uri.getPath().substring(1)));
        command.addAll(List.of(options));
        Path log = temporary.resolve(UUID.randomUUID() + ".log");
        var builder = new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(log.toFile());
        builder.environment().put("PGPASSWORD", "");
        builder.environment().remove("PGOPTIONS");
        builder.environment().put("PGCLIENTENCODING", "UTF8");
        var process = builder.start();
        if (!process.waitFor(60, java.util.concurrent.TimeUnit.SECONDS)) {
            process.destroyForcibly();
            fail("PostgreSQL client timed out");
        }
        String output = Files.readString(log);
        assertEquals(0, process.exitValue(), output);
        return output;
    }

    private List<String> schema(String url) throws Exception {
        return pg("pg_dump", url, "--schema-only", "--schema=public", "--no-owner", "--no-privileges",
                "--exclude-table=public.flyway_schema_history").lines()
                .filter(line -> !line.isBlank() && !line.startsWith("--") && !line.startsWith("\\restrict ") && !line.startsWith("\\unrestrict "))
                .toList();
    }

    @Test void finalSchemaIsIdenticalAndEachLineageValidatesOnlyItsOwnHistory() throws Exception {
        String legacy = database(), split = database();
        var old = migration(legacy, LEGACY, null);
        var fresh = migration(split, SPLIT, null);
        assertEquals(9, old.migrate().migrationsExecuted);
        assertEquals(24, fresh.migrate().migrationsExecuted);
        old.validate(); fresh.validate();
        assertEquals(schema(legacy), schema(split));
        assertEquals(0, old.migrate().migrationsExecuted);
        assertEquals(0, fresh.migrate().migrationsExecuted);
        assertFalse(migration(legacy, SPLIT, null).validateWithResult().validationSuccessful);
        assertFalse(migration(split, LEGACY, null).validateWithResult().validationSuccessful);
        assertEquals(22, rows(split, "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history'").size());
        assertEquals(List.of("1"), rows(split, "SELECT id FROM appointment_coordination"));
    }

    @Test void splitMilestonesPreservePriorHistoryAndRows() throws Exception {
        String url = database();
        int previous = 0;
        for (int milestone : List.of(5, 6, 7, 9, 14, 24)) {
            List<String> before = previous == 0 ? List.of() : rows(url, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank");
            assertEquals(milestone - previous, migration(url, SPLIT, Integer.toString(milestone)).migrate().migrationsExecuted);
            assertEquals(before, rows(url, "SELECT to_jsonb(h)::text FROM flyway_schema_history h WHERE version::integer<=" + previous + " ORDER BY installed_rank"));
            if (previous == 0) execute(url, "INSERT INTO users(id,full_name,email,role,origin) VALUES ('00000000-0000-0000-0000-000000000001','Synthetic retained','retained@example.invalid','ADMIN','ADMIN_INVITATION')");
            assertEquals(List.of("Synthetic retained"), rows(url, "SELECT full_name FROM users"));
            previous = milestone;
        }
        migration(url, SPLIT, null).validate();
    }

    @Test void failedTableFileRollsBackAndCanResumeWithoutRepair() throws Exception {
        String url = database();
        assertEquals(21, migration(url, SPLIT, "21").migrate().migrationsExecuted);
        var before = rows(url, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank");
        execute(url, "CREATE VIEW result_values AS SELECT 1 AS obstruction");
        assertThrows(org.flywaydb.core.api.FlywayException.class, () -> migration(url, SPLIT, null).migrate());
        assertEquals(before, rows(url, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank"));
        assertEquals(List.of("0"), rows(url, "SELECT count(*) FROM pg_indexes WHERE indexname='result_values_parameter_idx'"));
        execute(url, "DROP VIEW result_values");
        assertEquals(3, migration(url, SPLIT, null).migrate().migrationsExecuted);
        migration(url, SPLIT, null).validate();
        assertEquals(0, migration(url, SPLIT, null).migrate().migrationsExecuted);
    }

    private List<String> tables(String url) throws SQLException {
        return rows(url, "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history' ORDER BY tablename");
    }

    private Map<String, List<String>> data(String url) throws SQLException {
        Map<String, List<String>> snapshot = new LinkedHashMap<>();
        for (String table : tables(url)) snapshot.put(table, rows(url, "SELECT to_jsonb(t)::text FROM " + table + " t ORDER BY 1"));
        for (String sequence : SEQUENCES) snapshot.put(sequence, rows(url, "SELECT last_value::text||':'||is_called::text FROM " + sequence));
        return snapshot;
    }

    private void assertProtections(String url) throws SQLException {
        for (String sql : List.of("UPDATE test_results SET explanation='tampered' WHERE status='PUBLISHED'",
                "DELETE FROM test_results WHERE status='PUBLISHED'", "UPDATE result_values SET notes='tampered'",
                "DELETE FROM result_specimens", "DELETE FROM laboratory_events")) {
            assertEquals("23514", assertThrows(SQLException.class, () -> execute(url, sql)).getSQLState(), sql);
        }
        assertTrue(rows(url, "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'O'").isEmpty());
        assertTrue(rows(url, "SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated").isEmpty());
        // Import temporarily disables RI triggers too: validated flags alone do not
        // prove copied rows satisfy foreign keys. Check every actual FK by key columns.
        String foreignKeyChecks = """
                SELECT format('SELECT count(*) FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)',
                    con.conrelid::regclass,
                    string_agg(format('c.%I IS NOT NULL', ca.attname), ' AND ' ORDER BY k.ordinality),
                    con.confrelid::regclass,
                    string_agg(format('c.%I=p.%I', ca.attname, pa.attname), ' AND ' ORDER BY k.ordinality))
                FROM pg_constraint con
                CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(child, parent, ordinality)
                JOIN pg_attribute ca ON ca.attrelid=con.conrelid AND ca.attnum=k.child
                JOIN pg_attribute pa ON pa.attrelid=con.confrelid AND pa.attnum=k.parent
                WHERE con.contype='f' AND con.connamespace='public'::regnamespace
                GROUP BY con.oid ORDER BY con.conname
                """;
        for (String check : rows(url, foreignKeyChecks)) assertEquals(List.of("0"), rows(url, check), check);
    }

    @Test void syntheticDataCopyPreservesAllRowsSequencesAndPublishedCorrectionProtections() throws Exception {
        String legacy = database(), split = database();
        migration(legacy, LEGACY, null).migrate();
        migration(split, SPLIT, null).migrate();
        execute(legacy, resource("/db/fixtures/migration-lineage-synthetic.sql"));
        var before = data(legacy);
        assertTrue(before.values().stream().allMatch(value -> !value.isEmpty()), "Fixture covers every table and sequence");
        var oldHistory = rows(legacy, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank");
        var newHistory = rows(split, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank");
        Path dump = temporary.resolve("synthetic-data.sql");
        pg("pg_dump", legacy, "--data-only", "--schema=public", "--disable-triggers", "--no-owner", "--no-privileges",
                "--exclude-table=public.flyway_schema_history", "--file=" + dump);
        // Remove only the fresh destination's seed, inside the same atomic import.
        Path load = temporary.resolve("load.sql");
        Files.writeString(load, "DELETE FROM public.appointment_coordination WHERE id=1;\n" + Files.readString(dump));
        pg("psql", split, "-X", "--set=ON_ERROR_STOP=1", "--single-transaction", "--file=" + load);
        assertEquals(before, data(split));
        assertEquals(before, data(legacy));
        assertEquals(oldHistory, rows(legacy, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank"));
        assertEquals(newHistory, rows(split, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank"));
        assertEquals(schema(legacy), schema(split));
        migration(legacy, LEGACY, null).validate(); migration(split, SPLIT, null).validate();
        assertProtections(legacy); assertProtections(split);
        assertEquals(List.of("2:1"), rows(split, "SELECT count(*)::text||':'||count(*) FILTER(WHERE is_current)::text FROM test_results WHERE status='PUBLISHED'"));
        for (String sequence : SEQUENCES) {
            assertEquals(rows(legacy, "SELECT nextval('" + sequence + "')"), rows(split, "SELECT nextval('" + sequence + "')"));
        }
    }

    @Test void currentManifestAddsExactlyOneNotificationTableAndFreshSchemaValidates() throws Exception {
        String url = database();
        var current = migration(url, SPLIT, "25");
        var pending = current.info().pending();
        assertEquals(25, pending.length);
        assertEquals("V25__patient_notifications.sql", pending[24].getScript());
        String sql = resource("/db/migration/V25__patient_notifications.sql");
        assertEquals(1, Pattern.compile("(?im)^CREATE TABLE\\s+").matcher(sql).results().count());
        assertFalse(Pattern.compile("(?im)^INSERT\\s").matcher(sql).find(), "No historical backfill");
        assertEquals(25, current.migrate().migrationsExecuted); current.validate();
        assertEquals(0, current.migrate().migrationsExecuted);
        assertEquals(23, tables(url).size());
        assertEquals(List.of("0"), rows(url, "SELECT count(*) FROM patient_notifications"));
    }

    @Test void notificationUpgradePreservesAllV24DataDdlSequencesAndHistoryWithoutBackfill() throws Exception {
        String url = database(); migration(url, SPLIT, "24").migrate();
        execute(url, resource("/db/fixtures/migration-lineage-synthetic.sql"));
        var before = data(url); var ddl = schema(url);
        var history = rows(url, "SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank");
        var current = migration(url, SPLIT, "25"); assertEquals(1, current.migrate().migrationsExecuted);
        current.validate(); assertEquals(0, current.migrate().migrationsExecuted);
        var after = data(url); assertEquals(List.of(), after.remove("patient_notifications"));
        assertEquals(before, after);
        assertEquals(history, rows(url, "SELECT to_jsonb(h)::text FROM flyway_schema_history h WHERE version::integer<=24 ORDER BY installed_rank"));
        var priorDdl = pg("pg_dump", url, "--schema-only", "--schema=public", "--no-owner", "--no-privileges",
                "--exclude-table=public.flyway_schema_history", "--exclude-table=public.patient_notifications").lines()
                .filter(line -> !line.isBlank() && !line.startsWith("--") && !line.startsWith("\\restrict ") && !line.startsWith("\\unrestrict ")).toList();
        assertEquals(ddl, priorDdl, "All preexisting DDL unchanged");
        assertProtections(url);
        String insert = "INSERT INTO patient_notifications(patient_id,order_id,category,event_type,event_key,title,message) "
                + "SELECT patient_id,id,'ORDERS','ORDER_CREATED','synthetic-migration-event','Synthetic title','Synthetic message' FROM test_orders ORDER BY id LIMIT 1";
        execute(url, insert);
        assertEquals("23505", assertThrows(SQLException.class, () -> execute(url, insert)).getSQLState());
        assertEquals("23514", assertThrows(SQLException.class, () -> execute(url, "UPDATE patient_notifications SET read_at=created_at-interval '1 second'")).getSQLState());
        assertEquals("23514", assertThrows(SQLException.class, () -> execute(url, "UPDATE patient_notifications SET event_type='RESULT_PUBLISHED'")).getSQLState());
        assertEquals("23503", assertThrows(SQLException.class, () -> execute(url, "UPDATE patient_notifications SET patient_id='ffffffff-ffff-ffff-ffff-ffffffffffff'")).getSQLState());
        execute(url, "UPDATE patient_notifications SET read_at=created_at");
        assertEquals(List.of("1"), rows(url, "SELECT count(*) FROM patient_notifications WHERE read_at=created_at"));
    }
}
