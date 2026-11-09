package com.smartlims.laboratory;

import java.sql.*;
import java.util.*;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;

import static org.junit.jupiter.api.Assertions.*;

class ResultMigrationTest {
    String root, name, url;

    @BeforeEach
    void prepare() throws SQLException {
        root = System.getenv("SMARTLIMS_TEST_DATABASE_URL");
        if (root == null || !root.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression"))
            throw new IllegalStateException("Disposable PostgreSQL required");
        name = "smartlims_migration_" + UUID.randomUUID().toString().replace("-", "");
        try (var c = DriverManager.getConnection(root, "postgres", ""); var s = c.createStatement()) {
            s.executeUpdate("CREATE DATABASE " + name);
        }
        url = root.substring(0, root.lastIndexOf('/') + 1) + name;
    }

    @AfterEach
    void cleanup() throws SQLException {
        if (url == null)
            return;
        if (!name.matches("smartlims_migration_[0-9a-f]{32}"))
            throw new IllegalStateException("Unexpected database");
        try (var c = DriverManager.getConnection(root, "postgres", ""); var s = c.createStatement()) {
            s.executeUpdate("DROP DATABASE " + name);
        }
    }

    Flyway migration(String target) {
        var c = Flyway.configure().dataSource(url, "postgres", "").locations("classpath:db/migration");
        if (target != null)
            c.target(target);
        return c.load();
    }

    List<String> rows(String sql) throws SQLException {
        try (var c = DriverManager.getConnection(url, "postgres", ""); var s = c.createStatement(); var r = s.executeQuery(sql)) {
            List<String> rows = new ArrayList<>();
            while (r.next())
                rows.add(r.getString(1));
            return rows;
        }
    }

    @Test
    void v20UpgradePreservesCatalogOrderAppointmentRowsAndMigrationHistory() throws SQLException {
        assertEquals(20, migration("20").migrate().migrationsExecuted);
        try (var c = DriverManager.getConnection(url, "postgres", ""); var s = c.createStatement()) {
            for (String sql : List.of(
                    "INSERT INTO users(id,full_name,email,role,origin) VALUES ('00000000-0000-0000-0000-000000000001','Synthetic','synthetic@example.invalid','ADMIN','ADMIN_INVITATION')",
                    "INSERT INTO patients(id,patient_number,full_name,date_of_birth,gender,phone_number,created_by) VALUES ('00000000-0000-0000-0000-000000000002','PAT-SYNTHETIC','Synthetic','2000-01-01','UNKNOWN','000001','00000000-0000-0000-0000-000000000001')",
                    "INSERT INTO lab_tests(id,code,name,price,sample_type) VALUES ('00000000-0000-0000-0000-000000000003','SYN','Synthetic',1,'SYNTHETIC')",
                    "INSERT INTO lab_test_categories VALUES ('00000000-0000-0000-0000-000000000003','THYROID')",
                    "INSERT INTO test_orders(id,order_number,patient_id,created_by,idempotency_key,request_hash) VALUES ('00000000-0000-0000-0000-000000000004','ORD-000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',repeat('a',64))",
                    "INSERT INTO order_items(id,order_id,lab_test_id,test_code_snapshot,test_name_snapshot,price_at_order) VALUES ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','SYN','Original synthetic',1)",
                    "INSERT INTO appointment_types(id,code,name) VALUES ('00000000-0000-0000-0000-000000000006','SYN','Original synthetic type')",
                    "INSERT INTO appointment_slots(id,starts_at,ends_at,capacity) VALUES ('00000000-0000-0000-0000-000000000007','2030-01-01T10:00:00Z','2030-01-01T11:00:00Z',2)",
                    "INSERT INTO appointments(id,order_id,slot_id,original_slot_id,type_id,type_name_snapshot,created_by,idempotency_key) VALUES ('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000006','Original synthetic type','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011')"
            ))
                s.executeUpdate(sql);
        }
        List<String> tables = List.of("users", "patients", "lab_tests", "lab_test_categories", "test_orders", "order_items", "appointment_types", "appointment_slots");
        Map<String, List<String>> before = new LinkedHashMap<>();
        for (String table : tables)
            before.put(table, rows("SELECT to_jsonb(t)::text FROM " + table + " t ORDER BY 1"));
        var appointment = rows("SELECT to_jsonb(a)::text FROM appointments a");
        var history = rows("SELECT to_jsonb(h)::text FROM flyway_schema_history h ORDER BY installed_rank");
        var f = migration(null);
        assertEquals(5, f.migrate().migrationsExecuted);
        f.validate();
        for (var entry : before.entrySet())
            assertEquals(entry.getValue(), rows("SELECT to_jsonb(t)::text FROM " + entry.getKey() + " t ORDER BY 1"));
        // V20 already includes V16's visit-state columns; preserve the complete row.
        assertEquals(appointment, rows("SELECT to_jsonb(a)::text FROM appointments a"));
        assertEquals(history, rows("SELECT to_jsonb(h)::text FROM flyway_schema_history h WHERE version::integer<=20 ORDER BY installed_rank"));
        for (String table : List.of("test_parameters", "visits", "samples", "test_results", "result_values", "laboratory_events"))
            assertEquals(List.of("0"), rows("SELECT count(*) FROM " + table));
    }
}
