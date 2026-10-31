package com.smartlims.patients;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.*;

// Each case owns a separate, newly created database on the explicitly isolated test server.
// It never connects to smart_lims_db and never cleans an existing database/schema.
@EnabledIfEnvironmentVariable(named = "SMARTLIMS_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression")
class PatientMigrationCompatibilityTest {
    @TempDir Path historicalMigrations;
    private String rootUrl;
    private String databaseName;
    private String testUrl;

    @BeforeEach
    void createDisposableDatabase() throws SQLException {
        rootUrl = System.getenv("SMARTLIMS_TEST_DATABASE_URL");
        if (rootUrl == null || !rootUrl.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression")) {
            throw new IllegalStateException("An explicitly isolated regression database is required.");
        }
        databaseName = "smartlims_migration_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection root = DriverManager.getConnection(rootUrl, "postgres", "");
             Statement statement = root.createStatement()) {
            statement.executeUpdate("CREATE DATABASE " + databaseName);
        }
        testUrl = rootUrl.substring(0, rootUrl.lastIndexOf('/') + 1) + databaseName;
    }

    @AfterEach
    void dropOnlyOwnedDisposableDatabase() throws SQLException {
        if (testUrl == null) return;
        if (!databaseName.matches("smartlims_migration_[0-9a-f]{32}")) {
            throw new IllegalStateException("Refusing to drop an unexpected database.");
        }
        try (Connection root = DriverManager.getConnection(rootUrl, "postgres", "");
             Statement statement = root.createStatement()) {
            statement.executeUpdate("DROP DATABASE " + databaseName);
        }
    }

    private Connection connection() throws SQLException {
        return DriverManager.getConnection(testUrl, "postgres", "");
    }

    private Flyway canonical(String target) {
        var config = Flyway.configure().dataSource(testUrl, "postgres", "")
                .locations("classpath:db/migration");
        if (target != null) config.target(target);
        return config.load();
    }

    private Flyway historical(String target, boolean outOfOrder) {
        var config = Flyway.configure().dataSource(testUrl, "postgres", "")
                .locations("classpath:db/fixtures/historical-v1-v9").outOfOrder(outOfOrder);
        if (target != null) config.target(target);
        return config.load();
    }

    private void migrateLegacyLinkingV4() throws IOException {
        for (String filename : List.of("V1__auth_foundation.sql", "V2__password_reset_attempts.sql",
                "V3__patients.sql", "V5__patient_link_tokens.sql")) {
            try (var source = getClass().getResourceAsStream("/db/fixtures/historical-v1-v9/" + filename)) {
                assertNotNull(source, filename);
                Files.copy(source, historicalMigrations.resolve(filename.replace("V5__", "V4__")));
            }
        }
        Flyway legacy = Flyway.configure().dataSource(testUrl, "postgres", "")
                .locations("filesystem:" + historicalMigrations.toAbsolutePath()).load();
        assertEquals(4, legacy.migrate().migrationsExecuted);
        legacy.validate();
    }

    private void seedPatientAndToken() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("INSERT INTO users(id,full_name,email,role,origin) VALUES "
                    + "('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Synthetic Account','migration@example.invalid','PATIENT','PUBLIC_REGISTRATION')");
            statement.executeUpdate("INSERT INTO patients(id,patient_number,full_name,date_of_birth,gender,phone_number,created_by) VALUES "
                    + "('cccccccc-cccc-4ccc-8ccc-cccccccccccc','PAT-SYNTHETIC','Synthetic Profile','2000-01-01','UNKNOWN','000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')");
            if (tableExists("patient_link_tokens")) {
                statement.executeUpdate("INSERT INTO patient_link_tokens(id,token_hash,patient_id,issued_by,expires_at) VALUES "
                        + "('dddddddd-dddd-4ddd-8ddd-dddddddddddd',repeat('a',64),'cccccccc-cccc-4ccc-8ccc-cccccccccccc',"
                        + "'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',CURRENT_TIMESTAMP + INTERVAL '10 minutes')");
            }
        }
    }

    private boolean tableExists(String table) throws SQLException {
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("SELECT to_regclass(?) IS NOT NULL")) {
            statement.setString(1, "public." + table);
            try (ResultSet rows = statement.executeQuery()) { rows.next(); return rows.getBoolean(1); }
        }
    }

    private int count(String table) throws SQLException {
        // All table names are fixed constants from these tests.
        try (Connection connection = connection(); Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT count(*) FROM " + table)) {
            rows.next(); return rows.getInt(1);
        }
    }

    private void runReviewedReconciliation(String expectedDatabase) throws IOException, SQLException {
        if (!expectedDatabase.matches("[a-z0-9_]+")) throw new IllegalArgumentException();
        String sql;
        try (var source = getClass().getResourceAsStream("/db/fixtures/reconcile-patient-linking-v4-to-v5.sql")) {
            assertNotNull(source, "Reconciliation SQL fixture");
            sql = new String(source.readAllBytes(), StandardCharsets.UTF_8)
                    .replace(":'expected_database'", "'" + expectedDatabase + "'");
        }
        try (Connection connection = connection()) {
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.execute(sql);
                connection.commit();
            } catch (SQLException error) {
                connection.rollback();
                throw error;
            }
        }
    }

    private void assertHistoricalHistory() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT version, script, checksum FROM flyway_schema_history "
                     + "WHERE version IS NOT NULL ORDER BY version::integer")) {
            Map<String, String> scripts = new LinkedHashMap<>();
            while (rows.next()) {
                scripts.put(rows.getString(1), rows.getString(2));
                if ("5".equals(rows.getString(1))) assertEquals(504398204, rows.getInt(3));
            }
            assertEquals(List.of("1", "2", "3", "4", "5", "6", "7", "8", "9"), new ArrayList<>(scripts.keySet()));
            assertEquals("V4__lab_tests.sql", scripts.get("4"));
            assertEquals("V5__patient_link_tokens.sql", scripts.get("5"));
            assertEquals("V6__lab_test_categories.sql", scripts.get("6"));
            assertEquals("V7__orders.sql", scripts.get("7"));
        }
    }

    private void assertCanonicalHistory() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT version, script FROM flyway_schema_history "
                     + "WHERE success AND version IS NOT NULL ORDER BY version::integer")) {
            Map<String, String> scripts = new LinkedHashMap<>();
            while (rows.next()) scripts.put(rows.getString(1), rows.getString(2));
            assertEquals(java.util.stream.IntStream.rangeClosed(1, 25).mapToObj(Integer::toString).toList(),
                    new ArrayList<>(scripts.keySet()));
            assertEquals("V4__patients.sql", scripts.get("4"));
            assertEquals("V5__lab_tests.sql", scripts.get("5"));
            assertEquals("V6__patient_link_tokens.sql", scripts.get("6"));
            assertEquals("V7__lab_test_categories.sql", scripts.get("7"));
            assertEquals("V8__test_orders.sql", scripts.get("8"));
            assertEquals("V9__order_items.sql", scripts.get("9"));
            assertEquals("V24__laboratory_events.sql", scripts.get("24"));
            assertEquals("V25__patient_notifications.sql", scripts.get("25"));
        }
    }

    private List<Object> linkingHistoryMetadata(String version) throws SQLException {
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(
                "SELECT installed_rank, description, type, checksum, installed_by, installed_on, execution_time, success "
                        + "FROM flyway_schema_history WHERE version = ?")) {
            statement.setString(1, version);
            try (ResultSet rows = statement.executeQuery()) {
                assertTrue(rows.next());
                List<Object> metadata = new ArrayList<>();
                for (int i = 1; i <= 8; i++) metadata.add(rows.getObject(i));
                assertFalse(rows.next());
                return metadata;
            }
        }
    }

    @Test
    void freshDatabaseAppliesAndValidatesExactlyTwentyFiveCanonicalMigrations() throws SQLException {
        Flyway flyway = canonical(null);
        assertEquals(25, flyway.migrate().migrationsExecuted);
        flyway.validate();
        assertCanonicalHistory();
        assertTrue(tableExists("lab_tests"));
        assertTrue(tableExists("patient_link_tokens"));
    }

    @Test
    void mainV5UpgradeRetainsExistingCatalogAndPatientRows() throws SQLException {
        assertEquals(5, canonical("5").migrate().migrationsExecuted);
        seedPatientAndToken();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("INSERT INTO lab_tests(id,code,name,price,sample_type) VALUES "
                    + "('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','SYNTHETIC','Synthetic Catalog Test',1.00,'SYNTHETIC')");
        }
        Flyway flyway = canonical(null);
        assertEquals(20, flyway.migrate().migrationsExecuted);
        flyway.validate();
        assertCanonicalHistory();
        assertEquals(1, count("patients"));
        assertEquals(1, count("lab_tests"));
        assertEquals(0, count("patient_link_tokens"));
    }

    @Test
    void reviewedLegacyReconciliationPreservesDataAndOriginalMetadata() throws Exception {
        migrateLegacyLinkingV4();
        seedPatientAndToken();
        List<Object> before = linkingHistoryMetadata("4");
        runReviewedReconciliation(databaseName);
        assertEquals(before, linkingHistoryMetadata("5"));
        assertFalse(tableExists("lab_tests"));
        assertEquals(1, count("patients"));
        assertEquals(1, count("patient_link_tokens"));
        Flyway oneTimeMigration = historical(null, true);
        assertEquals(5, oneTimeMigration.migrate().migrationsExecuted);
        // Normal strict startup must succeed without persisting the out-of-order option.
        Flyway normal = historical(null, false);
        normal.validate();
        assertEquals(0, normal.migrate().migrationsExecuted);
        assertHistoricalHistory();
        assertEquals(before, linkingHistoryMetadata("5"));
        assertEquals(1, count("patients"));
        assertEquals(1, count("patient_link_tokens"));
        assertEquals(0, count("lab_tests"));
    }

    @Test
    void checksumMismatchAbortsReconciliationWithoutReclassifyingHistory() throws Exception {
        migrateLegacyLinkingV4();
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = '4'");
        }
        List<Object> before = linkingHistoryMetadata("4");
        assertThrows(SQLException.class, () -> runReviewedReconciliation(databaseName));
        assertEquals(before, linkingHistoryMetadata("4"));
        assertEquals(4, count("flyway_schema_history"));
        assertFalse(tableExists("lab_tests"));
    }

    @Test
    void wrongExpectedDatabaseAbortsReconciliation() throws Exception {
        migrateLegacyLinkingV4();
        List<Object> before = linkingHistoryMetadata("4");
        assertThrows(SQLException.class, () -> runReviewedReconciliation("unexpected_database"));
        assertEquals(before, linkingHistoryMetadata("4"));
    }

    @Test
    void connectedClientsPreventReconciliation() throws Exception {
        migrateLegacyLinkingV4();
        List<Object> before = linkingHistoryMetadata("4");
        try (Connection otherClient = connection()) {
            assertFalse(otherClient.isClosed());
            assertThrows(SQLException.class, () -> runReviewedReconciliation(databaseName));
        }
        assertEquals(before, linkingHistoryMetadata("4"));
    }
}
