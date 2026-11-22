package com.smartlims.appointments;

import com.smartlims.SmartLimsApplication;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import java.nio.file.*;
import java.security.SecureRandom;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Explicit opt-in. Owns one newly created migration database; never connects to the development database. */
class BookingCatalogPostmanVerification {
    @TempDir Path temporary;
    @TestConfiguration(proxyBeanMethods = false)
    static class FakeEmail {
        @Bean @Primary VerificationEmailSender fakeEmail() { return mock(VerificationEmailSender.class); }
    }

    @Test
    void savedRequestsRunAgainstAnUpgradedDatabaseWithRetainedBookings() throws Exception {
        String root = System.getenv("SMARTLIMS_TEST_DATABASE_URL");
        assertNotNull(root);
        assertTrue(root.matches("jdbc:postgresql://127\\.0\\.0\\.1:55432/smartlims_auth_regression"));
        var rootJdbc = new JdbcTemplate(new DriverManagerDataSource(root, "postgres", ""));
        assertEquals("smartlims_auth_regression", rootJdbc.queryForObject("SELECT current_database()", String.class));
        assertEquals("127.0.0.1", rootJdbc.queryForObject("SELECT host(inet_server_addr())", String.class));
        assertEquals("smartlims-disposable-regression-20261031", rootJdbc.queryForObject("SELECT current_setting('cluster_name')", String.class));
        assertEquals(System.getenv("SMARTLIMS_TEST_POSTGRES_DATA").replace('\\','/').toLowerCase(Locale.ROOT),
                rootJdbc.queryForObject("SELECT current_setting('data_directory')", String.class).replace('\\','/').toLowerCase(Locale.ROOT));
        String name = "smartlims_migration_" + UUID.randomUUID().toString().replace("-", "");
        rootJdbc.execute("CREATE DATABASE " + name);
        String url = root.substring(0, root.lastIndexOf('/') + 1) + name;
        try {
            var jdbc = new JdbcTemplate(new DriverManagerDataSource(url, "postgres", ""));
            Flyway.configure().dataSource(url, "postgres", "").locations("classpath:db/migration").target("28").load().migrate();
            try (var stream = getClass().getResourceAsStream("/db/fixtures/migration-lineage-synthetic.sql")) {
                assertNotNull(stream); jdbc.execute(new String(stream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            }
            UUID admin = UUID.fromString("00000000-0000-0000-0000-000000000001");
            UUID patient = UUID.fromString("00000000-0000-0000-0000-000000000003");
            UUID profile = UUID.fromString("00000000-0000-0000-0000-000000000004");
            UUID test = UUID.fromString("00000000-0000-0000-0000-000000000005");
            UUID type = UUID.fromString("00000000-0000-0000-0000-000000000011");
            UUID legacyOrder = UUID.randomUUID(), newOrder = UUID.randomUUID();
            for (UUID id : List.of(legacyOrder, newOrder)) {
                jdbc.update("INSERT INTO test_orders(id,order_number,patient_id,created_by,idempotency_key,request_hash) VALUES (?,'ORD-'||lpad(nextval('order_number_seq')::text,6,'0'),?,?,?,repeat('a',64))", id, profile, admin, UUID.randomUUID());
                jdbc.update("INSERT INTO order_items(id,order_id,lab_test_id,test_code_snapshot,test_name_snapshot,price_at_order) SELECT ?,?,id,code,name,price FROM lab_tests WHERE id=?", UUID.randomUUID(), id, test);
            }
            UUID oldSlot = UUID.randomUUID(), targetSlot = UUID.randomUUID(), legacyAppointment = UUID.randomUUID();
            Instant start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).plusSeconds(172800);
            for (int i = 0; i < 2; i++) {
                var at = start.plusSeconds(i * 3600L);
                jdbc.update("INSERT INTO appointment_slots(id,starts_at,ends_at,capacity) VALUES (?,?,?,2)", i==0 ? oldSlot : targetSlot, Timestamp.from(at), Timestamp.from(at.plusSeconds(1800)));
            }
            jdbc.update("INSERT INTO appointments(id,order_id,slot_id,original_slot_id,type_id,type_name_snapshot,created_by,idempotency_key) VALUES (?,?,?,?,?,'Synthetic legacy lab visit',?,?)", legacyAppointment, legacyOrder, oldSlot, oldSlot, type, patient, UUID.randomUUID());
            var before = jdbc.queryForList("SELECT (to_jsonb(a)-'type_id'-'type_name_snapshot')::text AS row FROM appointments a ORDER BY id");
            var slotsBefore = jdbc.queryForList("SELECT to_jsonb(s)::text AS row FROM appointment_slots s ORDER BY id");
            var history = jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank");
            byte[] key = new byte[32]; new SecureRandom().nextBytes(key);
            try (var context = new SpringApplicationBuilder(SmartLimsApplication.class, FakeEmail.class).run(
                    "--spring.profiles.active=verification", "--server.address=127.0.0.1", "--server.port=0",
                    "--spring.datasource.url="+url, "--spring.datasource.username=postgres", "--spring.datasource.password=",
                    "--spring.jpa.hibernate.ddl-auto=validate", "--spring.mail.host=",
                    "--smartlims.auth.jwt.secret-base64="+Base64.getEncoder().encodeToString(key),
                    "--smartlims.auth.browser.allowed-origins=http://localhost:5173", "--smartlims.auth.browser.secure-cookies=true")) {
                assertEquals(before, jdbc.queryForList("SELECT to_jsonb(a)::text AS row FROM appointments a ORDER BY id"));
                assertEquals(slotsBefore, jdbc.queryForList("SELECT to_jsonb(s)::text AS row FROM appointment_slots s ORDER BY id"));
                assertEquals(history, jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version::integer<=28 ORDER BY installed_rank"));
                assertEquals("29", jdbc.queryForObject("SELECT max(version::integer)::text FROM flyway_schema_history", String.class));
                var users = context.getBean(UserAccountRepository.class);
                for (UUID id : List.of(admin, patient)) {
                    var account = users.findById(id).orElseThrow();
                    account.acceptInvitation("test-only-unused-hash", Instant.now()); users.saveAndFlush(account);
                }
                var encoder = context.getBean(JwtEncoder.class);
                var runtime = new LinkedHashMap<String,String>();
                runtime.put("baseUrl", "http://127.0.0.1:"+((WebServerApplicationContext)context).getWebServer().getPort());
                runtime.put("disposableConfirmed", "true"); runtime.put("orderId", newOrder.toString());
                runtime.put("legacyAppointmentId", legacyAppointment.toString()); runtime.put("slotId", oldSlot.toString());
                runtime.put("targetSlotId", targetSlot.toString()); runtime.put("appointmentVersion", "0");
                runtime.put("appointmentIdempotencyKey", UUID.randomUUID().toString());
                runtime.put("appointmentFrom", start.minusSeconds(1).toString()); runtime.put("appointmentTo", start.plusSeconds(86400).toString());
                runtime.put("referencedLabTestId", test.toString()); runtime.put("missingLabTestId", UUID.randomUUID().toString());
                runtime.put("adminToken", token(encoder, admin)); runtime.put("patientToken", token(encoder, patient));
                var log = temporary.resolve("saved-requests.log");
                var process = new ProcessBuilder("node", "postman/run-booking-delete.cjs").redirectErrorStream(true).redirectOutput(log.toFile()).start();
                try (var input = process.getOutputStream()) { input.write(context.getBean(JsonMapper.class).writeValueAsBytes(runtime)); }
                if (!process.waitFor(180, TimeUnit.SECONDS)) { process.destroyForcibly(); fail("Saved request execution timed out"); }
                System.out.println(Files.readString(log));
                assertEquals(0, process.exitValue(), "Saved request assertions failed");
                assertEquals("CANCELLED", jdbc.queryForObject("SELECT status FROM appointments WHERE id=?", String.class, legacyAppointment));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM appointment_reschedules WHERE appointment_id=?", Integer.class, legacyAppointment));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM lab_tests", Integer.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM lab_tests WHERE code LIKE 'DEL_%'", Integer.class));
                assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM test_results WHERE status='PUBLISHED'", Integer.class));
                verifyNoInteractions(context.getBean("fakeEmail", VerificationEmailSender.class));
            }
        } finally {
            assertTrue(name.matches("smartlims_migration_[0-9a-f]{32}"));
            rootJdbc.execute("DROP DATABASE " + name);
        }
    }

    String token(JwtEncoder encoder, UUID id) {
        var now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(id.toString()).issuer(JwtKeyConfiguration.ISSUER)
                .audience(List.of(JwtKeyConfiguration.AUDIENCE)).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
