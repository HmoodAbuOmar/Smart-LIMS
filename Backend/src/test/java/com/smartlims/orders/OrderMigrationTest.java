package com.smartlims.orders;

import java.sql.*;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

// Owns only newly created smartlims_migration_* databases on the verified disposable server.
@EnabledIfEnvironmentVariable(named = "SMARTLIMS_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression")
class OrderMigrationTest {
    private String rootUrl;
    private String databaseName;
    private String testUrl;
    private final UUID creator = UUID.randomUUID();
    private final UUID canceller = UUID.randomUUID();
    private final UUID patient = UUID.randomUUID();
    private final UUID test = UUID.randomUUID();

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
        var config = Flyway.configure().dataSource(testUrl, "postgres", "").locations("classpath:db/migration");
        if (target != null) config.target(target);
        return config.load();
    }

    private void execute(Connection connection, String sql, Object... args) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
            statement.executeUpdate();
        }
    }

    private void execute(String sql, Object... args) throws SQLException {
        try (Connection connection = connection()) { execute(connection, sql, args); }
    }

    private List<String> rows(String sql) throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            List<String> values = new ArrayList<>();
            while (result.next()) values.add(result.getString(1));
            return values;
        }
    }

    private void rejects(String state, String sql, Object... args) {
        SQLException error = assertThrows(SQLException.class, () -> execute(sql, args));
        assertEquals(state, error.getSQLState(), error.getMessage());
    }

    private void seedExistingData() throws SQLException {
        execute("INSERT INTO users(id,full_name,email,role,origin) VALUES "
                + "(?,'Synthetic creator','creator@example.invalid','ADMIN','ADMIN_INVITATION'),"
                + "(?,'Synthetic canceller','canceller@example.invalid','RECEPTIONIST','ADMIN_INVITATION')", creator, canceller);
        execute("INSERT INTO patients(id,patient_number,full_name,date_of_birth,gender,phone_number,created_by) "
                + "VALUES (?,'PAT-SYNTHETIC','Synthetic order profile','2000-01-01','UNKNOWN','000001',?)", patient, creator);
        execute("INSERT INTO lab_tests(id,code,name,price,sample_type) "
                + "VALUES (?,'SYNTH_TEST','Synthetic ordered test',25.50,'SYNTHETIC')", test);
        execute("INSERT INTO lab_test_categories(lab_test_id,category) VALUES (?,'THYROID')", test);
        execute("INSERT INTO email_action_tokens(id,user_id,purpose,token_hash,expires_at) "
                + "VALUES (?,?,'ACCEPT_INVITATION',repeat('a',64),'2030-01-01T00:00:00Z')", UUID.randomUUID(), creator);
        execute("INSERT INTO patient_link_tokens(id,token_hash,patient_id,issued_by,expires_at) "
                + "VALUES (?,repeat('b',64),?,?,'2030-01-01T00:00:00Z')", UUID.randomUUID(), patient, creator);
    }

    private UUID insertOrder(Connection connection, String number, UUID actor, UUID key) throws SQLException {
        UUID id = UUID.randomUUID();
        execute(connection, "INSERT INTO test_orders(id,order_number,patient_id,created_by,idempotency_key,request_hash) "
                + "VALUES (?,?,?,?,?,repeat('a',64))", id, number, patient, actor, key);
        return id;
    }

    private UUID insertOrder(String number, UUID actor, UUID key) throws SQLException {
        try (Connection connection = connection()) { return insertOrder(connection, number, actor, key); }
    }

    private void insertItem(Connection connection, UUID orderId, UUID testId) throws SQLException {
        execute(connection, "INSERT INTO order_items(id,order_id,lab_test_id,test_code_snapshot,test_name_snapshot,price_at_order) "
                + "VALUES (?,?,?,'SYNTH_TEST','Synthetic ordered test',25.50)", UUID.randomUUID(), orderId, testId);
    }

    private void ready() throws SQLException {
        migrations(null).migrate();
        seedExistingData();
    }

    @Test
    void freshDatabaseAppliesValidatesAndReappliesWithoutChanges() throws SQLException {
        Flyway flyway = migrations(null);
        assertEquals(24, flyway.migrate().migrationsExecuted);
        flyway.validate();
        assertEquals(java.util.stream.IntStream.rangeClosed(1, 24).mapToObj(Integer::toString).toList(), rows(
                "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank"));
        assertEquals(List.of("V8__test_orders.sql"), rows("SELECT script FROM flyway_schema_history WHERE version='8'"));
        assertEquals(List.of("0"), rows("SELECT count(*) FROM test_orders"));
        assertEquals(List.of("0"), rows("SELECT count(*) FROM order_items"));
        assertEquals(0, flyway.migrate().migrationsExecuted);

        List<String> indexes = rows("SELECT indexdef FROM pg_indexes WHERE tablename IN ('test_orders','order_items') ORDER BY indexname");
        assertEquals(9, indexes.size());
        for (String columns : List.of("(order_number)", "(created_by, idempotency_key)",
                "(patient_id, created_at DESC, id)", "(patient_id, status, created_at DESC, id)",
                "(cancelled_by)", "(order_id, lab_test_id)", "(lab_test_id)")) {
            assertTrue(indexes.stream().anyMatch(index -> index.contains(columns)), columns);
        }
        assertEquals(List.of("bigint|1|1|NO"), rows("SELECT data_type || '|' || start_value || '|' || increment || '|' || cycle_option "
                + "FROM information_schema.sequences WHERE sequence_name='order_number_seq'"));
        assertEquals(List.of("1"), rows("SELECT nextval('order_number_seq')"));
        assertEquals(List.of("2"), rows("SELECT nextval('order_number_seq')"));
    }

    @Test
    void upgradeFromV7PreservesAllExistingRowsHistoryAndPatientSequence() throws SQLException {
        assertEquals(7, migrations("7").migrate().migrationsExecuted);
        seedExistingData();
        assertEquals(List.of("42"), rows("SELECT setval('patient_number_seq', 42, true)"));
        Map<String, List<String>> before = new LinkedHashMap<>();
        for (String table : List.of("users", "email_action_tokens", "patients", "lab_tests", "patient_link_tokens", "lab_test_categories")) {
            before.put(table, rows("SELECT row_to_json(t)::text FROM " + table + " t ORDER BY 1"));
            assertFalse(before.get(table).isEmpty());
        }
        String history = "SELECT row_to_json(h)::text FROM flyway_schema_history h WHERE version::integer <= 7 ORDER BY installed_rank";
        List<String> oldHistory = rows(history);
        Flyway flyway = migrations(null);
        assertEquals(17, flyway.migrate().migrationsExecuted);
        flyway.validate();
        for (var entry : before.entrySet()) {
            assertEquals(entry.getValue(), rows("SELECT row_to_json(t)::text FROM " + entry.getKey() + " t ORDER BY 1"));
        }
        assertEquals(oldHistory, rows(history));
        assertEquals(List.of("43"), rows("SELECT nextval('patient_number_seq')"));
        assertEquals(List.of("1"), rows("SELECT nextval('order_number_seq')"));
        assertEquals(List.of("0"), rows("SELECT count(*) FROM test_orders"));
        assertEquals(List.of("0"), rows("SELECT count(*) FROM order_items"));
    }

    @Test
    void enforcesHeaderNullabilityFormatsStatesCurrencyAndRetryUniqueness() throws SQLException {
        ready();
        UUID key = UUID.randomUUID();
        UUID id = insertOrder("ORD-000001", creator, key);
        for (String column : List.of("order_number", "patient_id", "created_by", "idempotency_key", "request_hash", "status", "currency", "created_at", "updated_at")) {
            rejects("23502", "UPDATE test_orders SET " + column + "=NULL WHERE id=?", id);
        }
        rejects("23505", "INSERT INTO test_orders SELECT id,order_number,patient_id,created_by,idempotency_key,request_hash,"
                + "status,currency,cancelled_by,cancelled_at,cancellation_reason,created_at,updated_at FROM test_orders WHERE id=?", id);
        SQLException reused = assertThrows(SQLException.class, () -> insertOrder("ORD-000002", creator, key));
        assertEquals("23505", reused.getSQLState());
        SQLException number = assertThrows(SQLException.class, () -> insertOrder("ORD-000001", creator, UUID.randomUUID()));
        assertEquals("23505", number.getSQLState());
        insertOrder("ORD-000002", canceller, key); // Same key, different actor.
        insertOrder("ORD-000003", creator, UUID.randomUUID()); // New key, same actor/intent allowed.
        for (String invalid : List.of("ORD-1", "SAMPLE-000001", "ord-000001", "ORD-00000A", "ORD-12345678901234567890")) {
            rejects("23514", "UPDATE test_orders SET order_number=? WHERE id=?", invalid, id);
        }
        for (String valid : List.of("ORD-1000000", "ORD-9223372036854775807")) {
            execute("UPDATE test_orders SET order_number=? WHERE id=?", valid, id);
        }
        for (String invalid : List.of("", "a".repeat(63), "A".repeat(64), "g".repeat(64))) {
            rejects("23514", "UPDATE test_orders SET request_hash=? WHERE id=?", invalid, id);
        }
        for (String invalid : List.of("NEW", "pending", "UNKNOWN", "")) {
            rejects("23514", "UPDATE test_orders SET status=? WHERE id=?", invalid, id);
        }
        for (String valid : List.of("IN_PROGRESS", "COMPLETED", "PENDING")) execute("UPDATE test_orders SET status=? WHERE id=?", valid, id);
        rejects("23514", "UPDATE test_orders SET currency='USD' WHERE id=?", id);
        assertEquals(List.of("PENDING|ILS"), rows("SELECT status || '|' || currency FROM test_orders WHERE id='" + id + "'"));
    }

    @Test
    void enforcesCancellationConsistencyReasonAndTimestampAndRetainsRetryKey() throws SQLException {
        ready();
        UUID key = UUID.randomUUID();
        UUID id = insertOrder("ORD-000001", creator, key);
        rejects("23514", "UPDATE test_orders SET status='CANCELLED' WHERE id=?", id);
        rejects("23514", "UPDATE test_orders SET cancelled_by=? WHERE id=?", canceller, id);
        rejects("23514", "UPDATE test_orders SET cancelled_at=CURRENT_TIMESTAMP WHERE id=?", id);
        rejects("23514", "UPDATE test_orders SET cancellation_reason='Synthetic reason' WHERE id=?", id);
        rejects("23514", "UPDATE test_orders SET status='CANCELLED',cancelled_by=?,cancelled_at=created_at-interval '1 second' WHERE id=?", canceller, id);
        execute("UPDATE test_orders SET status='CANCELLED',cancelled_by=?,cancelled_at=created_at WHERE id=?", canceller, id);
        for (String invalid : List.of("", " ", "\t\n", " leading", "trailing ", "\tleading", "trailing\n", "a".repeat(1001))) {
            rejects("23514", "UPDATE test_orders SET cancellation_reason=? WHERE id=?", invalid, id);
        }
        execute("UPDATE test_orders SET cancellation_reason=? WHERE id=?", "a".repeat(1000), id);
        rejects("23514", "UPDATE test_orders SET cancelled_by=NULL WHERE id=?", id);
        rejects("23514", "UPDATE test_orders SET cancelled_at=NULL WHERE id=?", id);
        rejects("23514", "UPDATE test_orders SET status='PENDING' WHERE id=?", id);
        rejects("23503", "UPDATE test_orders SET cancelled_by=? WHERE id=?", UUID.randomUUID(), id);
        SQLException duplicate = assertThrows(SQLException.class, () -> insertOrder("ORD-000002", creator, key));
        assertEquals("23505", duplicate.getSQLState()); // No expiry or key release after cancellation.
    }

    @Test
    void enforcesItemSnapshotsPricesUniqueMembershipAndRetainedReferences() throws SQLException {
        ready();
        UUID order = insertOrder("ORD-000001", creator, UUID.randomUUID());
        try (Connection connection = connection()) { insertItem(connection, order, test); }
        for (String column : List.of("order_id", "lab_test_id", "test_code_snapshot", "test_name_snapshot", "price_at_order", "created_at")) {
            rejects("23502", "UPDATE order_items SET " + column + "=NULL WHERE order_id=?", order);
        }
        for (String invalid : List.of("", "lowercase", " CODE", "CODE!")) {
            rejects("23514", "UPDATE order_items SET test_code_snapshot=? WHERE order_id=?", invalid, order);
        }
        for (String invalid : List.of("", " ", "\t\n", " leading", "trailing ", "trailing\t")) {
            rejects("23514", "UPDATE order_items SET test_name_snapshot=? WHERE order_id=?", invalid, order);
        }
        rejects("22001", "UPDATE order_items SET test_code_snapshot=? WHERE order_id=?", "A".repeat(31), order);
        rejects("22001", "UPDATE order_items SET test_name_snapshot=? WHERE order_id=?", "a".repeat(151), order);
        rejects("23514", "UPDATE order_items SET price_at_order=-0.01 WHERE order_id=?", order);
        rejects("23514", "UPDATE order_items SET price_at_order='NaN'::numeric WHERE order_id=?", order);
        rejects("22003", "UPDATE order_items SET price_at_order='Infinity'::numeric WHERE order_id=?", order);
        rejects("22003", "UPDATE order_items SET price_at_order=10000000000.00 WHERE order_id=?", order);
        execute("UPDATE order_items SET price_at_order=0 WHERE order_id=?", order);
        execute("UPDATE order_items SET price_at_order=9999999999.99 WHERE order_id=?", order);
        SQLException duplicate = assertThrows(SQLException.class, () -> {
            try (Connection connection = connection()) { insertItem(connection, order, test); }
        });
        assertEquals("23505", duplicate.getSQLState());
        rejects("23503", "UPDATE order_items SET order_id=? WHERE order_id=?", UUID.randomUUID(), order);
        rejects("23503", "UPDATE order_items SET lab_test_id=? WHERE order_id=?", UUID.randomUUID(), order);
        rejects("23503", "UPDATE test_orders SET patient_id=? WHERE id=?", UUID.randomUUID(), order);
        rejects("23503", "UPDATE test_orders SET created_by=? WHERE id=?", UUID.randomUUID(), order);
        rejects("23503", "DELETE FROM test_orders WHERE id=?", order);
        execute("DELETE FROM lab_test_categories"); // Ensure the order-item FK alone retains the catalog row.
        rejects("23503", "DELETE FROM lab_tests WHERE id=?", test);
        execute("DELETE FROM patient_link_tokens");
        rejects("23503", "DELETE FROM patients WHERE id=?", patient);
        execute("DELETE FROM email_action_tokens");
        execute("UPDATE test_orders SET status='CANCELLED',cancelled_by=?,cancelled_at=created_at WHERE id=?", canceller, order);
        rejects("23503", "DELETE FROM users WHERE id=?", canceller); // Referenced only as cancellation actor.
        rejects("23503", "DELETE FROM users WHERE id=?", creator);
        assertEquals(List.of("1"), rows("SELECT count(*) FROM order_items"));
    }

    @Test
    void failedAggregateRollsBackHeaderItemsAndRetryKeyTogether() throws SQLException {
        ready();
        UUID key = UUID.randomUUID();
        try (Connection connection = connection()) {
            connection.setAutoCommit(false);
            UUID order = insertOrder(connection, "ORD-000001", creator, key);
            insertItem(connection, order, test);
            SQLException duplicate = assertThrows(SQLException.class, () -> insertItem(connection, order, test));
            assertEquals("23505", duplicate.getSQLState());
            connection.rollback();
        }
        assertEquals(List.of("0"), rows("SELECT count(*) FROM test_orders"));
        assertEquals(List.of("0"), rows("SELECT count(*) FROM order_items"));
        UUID retried = insertOrder("ORD-000002", creator, key);
        try (Connection connection = connection()) { insertItem(connection, retried, test); }
        assertEquals(List.of("1"), rows("SELECT count(*) FROM test_orders"));
    }

    @Test
    void concurrentSameActorRetryIsRejectedWithoutRemovingTheWinner() throws Exception {
        ready();
        UUID key = UUID.randomUUID();
        var started = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor(); Connection first = connection()) {
            first.setAutoCommit(false);
            UUID winner = insertOrder(first, "ORD-000001", creator, key);
            insertItem(first, winner, test);
            var duplicate = executor.submit(() -> {
                try (Connection second = connection(); Statement timeout = second.createStatement()) {
                    timeout.execute("SET statement_timeout='10s'");
                    started.countDown();
                    insertOrder(second, "ORD-000002", creator, key);
                    return "unexpected success";
                } catch (SQLException error) { return error.getSQLState(); }
            });
            try {
                assertTrue(started.await(5, TimeUnit.SECONDS));
                first.commit();
                assertEquals("23505", duplicate.get(15, TimeUnit.SECONDS));
            } finally { first.rollback(); }
            assertEquals(List.of(winner.toString()), rows("SELECT id::text FROM test_orders"));
            assertEquals(List.of("1"), rows("SELECT count(*) FROM order_items"));
        }
    }
}
