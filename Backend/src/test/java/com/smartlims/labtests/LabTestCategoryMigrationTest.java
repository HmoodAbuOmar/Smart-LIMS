package com.smartlims.labtests;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.*;

// Each case creates and drops only its own database on the verified disposable instance.
@EnabledIfEnvironmentVariable(named = "SMARTLIMS_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression")
class LabTestCategoryMigrationTest {
    private String rootUrl;
    private String databaseName;
    private String testUrl;

    @BeforeEach
    void createOwnedDatabase() throws SQLException {
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
    void dropOnlyOwnedDatabase() throws SQLException {
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

    private Flyway migrations(String target) {
        var config = Flyway.configure().dataSource(testUrl, "postgres", "")
                .locations("classpath:db/migration");
        if (target != null) config.target(target);
        return config.load();
    }

    private List<String> rows(String sql) throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            List<String> values = new ArrayList<>();
            while (result.next()) values.add(result.getString(1));
            return values;
        }
    }

    private UUID seedTest(String code, boolean active) throws SQLException {
        UUID id = UUID.randomUUID();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO lab_tests(id, code, name, description, price, currency, sample_type,
                    preparation_instructions, active, created_at, updated_at)
                VALUES (?, ?, 'Synthetic migration test', 'Synthetic description', 12.34, 'ILS',
                    'SYNTHETIC', 'Synthetic preparation text', ?, '2020-01-01T01:02:03Z', '2021-02-03T04:05:06Z')
                """)) {
            statement.setObject(1, id);
            statement.setString(2, code);
            statement.setBoolean(3, active);
            statement.executeUpdate();
        }
        return id;
    }

    private void assign(Connection connection, UUID id, String category) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO lab_test_categories(lab_test_id, category) VALUES (?, ?)")) {
            statement.setObject(1, id);
            statement.setString(2, category);
            statement.executeUpdate();
        }
    }

    private void assign(UUID id, String category) throws SQLException {
        try (Connection connection = connection()) { assign(connection, id, category); }
    }

    private void rejects(String sqlState, UUID id, String category) {
        SQLException error = assertThrows(SQLException.class, () -> assign(id, category));
        assertEquals(sqlState, error.getSQLState());
    }

    @Test
    void freshDatabaseAppliesAndValidatesCategorySchemaWithBothIndexes() throws SQLException {
        Flyway flyway = migrations(null);
        assertEquals(9, flyway.migrate().migrationsExecuted);
        flyway.validate();
        assertEquals(List.of("0"), rows("SELECT count(*) FROM lab_test_categories"));
        assertEquals(List.of("V6__lab_test_categories.sql"), rows(
                "SELECT script FROM flyway_schema_history WHERE version = '6' AND success"));
        List<String> indexes = rows("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' "
                + "AND tablename = 'lab_test_categories' ORDER BY indexname");
        assertEquals(2, indexes.size());
        assertTrue(indexes.stream().anyMatch(index -> index.contains("UNIQUE INDEX lab_test_categories_pkey")
                && index.contains("(lab_test_id, category)")));
        assertTrue(indexes.stream().anyMatch(index -> index.contains("(category, lab_test_id)")));
    }

    @Test
    void upgradeFromV5PreservesEveryCatalogFieldAndPriorMigrationMetadata() throws SQLException {
        assertEquals(5, migrations("5").migrate().migrationsExecuted);
        seedTest("SYNTH_ACTIVE", true);
        seedTest("SYNTH_INACTIVE", false);
        String catalogSql = "SELECT row_to_json(t)::text FROM lab_tests t ORDER BY id";
        String historySql = "SELECT row_to_json(h)::text FROM flyway_schema_history h "
                + "WHERE version::integer <= 5 ORDER BY installed_rank";
        List<String> beforeCatalog = rows(catalogSql);
        List<String> beforeHistory = rows(historySql);

        Flyway flyway = migrations(null);
        assertEquals(4, flyway.migrate().migrationsExecuted);
        flyway.validate();
        assertEquals(beforeCatalog, rows(catalogSql));
        assertEquals(beforeHistory, rows(historySql));
        assertEquals(List.of("0"), rows("SELECT count(*) FROM lab_test_categories"));
        assertEquals(0, flyway.migrate().migrationsExecuted);
        assertEquals(beforeCatalog, rows(catalogSql));
    }

    @Test
    void databaseConstraintsRejectDuplicateInvalidNullAndOrphanAssignments() throws SQLException {
        migrations(null).migrate();
        UUID first = seedTest("SYNTH_FIRST", true);
        UUID second = seedTest("SYNTH_SECOND", true);
        assign(first, "BLOOD_TESTS");
        assign(first, "THYROID");
        assign(second, "BLOOD_TESTS");

        rejects("23505", first, "BLOOD_TESTS");
        for (String invalid : List.of("UNKNOWN", "", "All", "thyroid", " THYROID ")) {
            rejects("23514", first, invalid);
        }
        rejects("23502", first, null);
        rejects("23502", null, "THYROID");
        rejects("23503", UUID.randomUUID(), "THYROID");
        assertEquals(List.of("3"), rows("SELECT count(*) FROM lab_test_categories"));
    }

    @Test
    void concurrentDuplicateAssignmentIsRejectedWithoutRemovingTheWinner() throws Exception {
        migrations(null).migrate();
        UUID id = seedTest("SYNTH_CONCURRENT", true);
        var started = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor(); Connection first = connection()) {
            first.setAutoCommit(false);
            assign(first, id, "THYROID");
            var duplicate = executor.submit(() -> {
                try (Connection second = connection(); Statement timeout = second.createStatement()) {
                    timeout.execute("SET statement_timeout = '10s'");
                    started.countDown();
                    assign(second, id, "THYROID");
                    return "unexpected success";
                } catch (SQLException error) {
                    return error.getSQLState();
                }
            });
            try {
                assertTrue(started.await(5, TimeUnit.SECONDS));
                first.commit();
                assertEquals("23505", duplicate.get(15, TimeUnit.SECONDS));
            } finally {
                first.rollback();
            }
        }
        assertEquals(List.of("1"), rows("SELECT count(*) FROM lab_test_categories"));
    }
}
