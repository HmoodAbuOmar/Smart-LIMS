package com.smartlims.appointments;

import java.sql.*;
import java.util.*;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;

import static org.junit.jupiter.api.Assertions.*;

class AppointmentMigrationTest {
    String root, name, url;

    @BeforeEach
    void prepare() throws Exception {
        root = System.getenv("SMARTLIMS_TEST_DATABASE_URL");
        if (root == null || !root.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression"))
            throw new IllegalStateException("Disposable database required");
        name = "smartlims_migration_" + UUID.randomUUID().toString().replace("-", "");
        try (var c = DriverManager.getConnection(root, "postgres", ""); var s = c.createStatement()) {
            s.executeUpdate("CREATE DATABASE " + name);
        }
        url = root.substring(0, root.lastIndexOf('/') + 1) + name;
    }

    @AfterEach
    void cleanup() throws Exception {
        if (url == null)
            return;
        if (!name.matches("smartlims_migration_[0-9a-f]{32}"))
            throw new IllegalStateException("Unexpected database");
        try (var c = DriverManager.getConnection(root, "postgres", ""); var s = c.createStatement()) {
            s.executeUpdate("DROP DATABASE " + name);
        }
    }

    Flyway migrations(String target) {
        var c = Flyway.configure().dataSource(url, "postgres", "").locations("classpath:db/migration");
        if (target != null)
            c.target(target);
        return c.load();
    }

    @Test
    void freshMigrationAndConstraintsWithoutSeeds() throws Exception {
        var f = migrations(null);
        assertEquals(25, f.migrate().migrationsExecuted);
        f.validate();
        assertEquals(0, f.migrate().migrationsExecuted);
        try (var c = DriverManager.getConnection(url, "postgres", ""); var s = c.createStatement()) {
            for (String table : List.of("appointment_types", "appointment_slots", "appointments", "appointment_reschedules"))
                try (var r = s.executeQuery("SELECT count(*) FROM " + table)) {
                    assertTrue(r.next());
                    assertEquals(0, r.getInt(1));
                }
            s.executeUpdate("INSERT INTO appointment_slots(id,starts_at,ends_at,capacity) VALUES ('00000000-0000-0000-0000-000000000001','2030-01-01T10:00:00Z','2030-01-01T11:00:00Z',1)");
            var overlap = assertThrows(SQLException.class, () -> s.executeUpdate("INSERT INTO appointment_slots(id,starts_at,ends_at,capacity,active) VALUES ('00000000-0000-0000-0000-000000000002','2030-01-01T10:30:00Z','2030-01-01T11:30:00Z',1,false)"));
            assertEquals("23P01", overlap.getSQLState());
            var capacity = assertThrows(SQLException.class, () -> s.executeUpdate("INSERT INTO appointment_slots(id,starts_at,ends_at,capacity) VALUES ('00000000-0000-0000-0000-000000000003','2030-01-02T10:00:00Z','2030-01-02T11:00:00Z',0)"));
            assertEquals("23514", capacity.getSQLState());
        }
    }

    @Test
    void upgradeFromV12PreservesExistingRowsAndMigrationChecksums() throws Exception {
        migrations("12").migrate();
        List<String> before = new ArrayList<>();
        try (var c = DriverManager.getConnection(url, "postgres", ""); var s = c.createStatement()) {
            s.executeUpdate("INSERT INTO users(id,full_name,email,role,origin) VALUES ('00000000-0000-0000-0000-000000000001','Synthetic','synthetic@example.invalid','ADMIN','ADMIN_INVITATION')");
            try (var r = s.executeQuery("SELECT version||':'||checksum FROM flyway_schema_history ORDER BY installed_rank")) {
                while (r.next())
                    before.add(r.getString(1));
            }
        }
        var f = migrations(null);
        assertEquals(13, f.migrate().migrationsExecuted);
        f.validate();
        try (var c = DriverManager.getConnection(url, "postgres", ""); var s = c.createStatement()) {
            List<String> after = new ArrayList<>();
            try (var r = s.executeQuery("SELECT version||':'||checksum FROM flyway_schema_history WHERE version::integer<=12 ORDER BY installed_rank")) {
                while (r.next())
                    after.add(r.getString(1));
            }
            assertEquals(before, after);
            try (var r = s.executeQuery("SELECT full_name,email FROM users")) {
                assertTrue(r.next());
                assertEquals("Synthetic", r.getString(1));
                assertEquals("synthetic@example.invalid", r.getString(2));
                assertFalse(r.next());
            }
        }
    }
}
