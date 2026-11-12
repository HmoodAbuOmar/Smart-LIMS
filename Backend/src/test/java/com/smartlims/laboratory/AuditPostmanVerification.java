package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.appointments.dto.AppointmentRequests;
import com.smartlims.labtests.dto.LabTestRequest;
import com.smartlims.labtests.service.LabTestService;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Explicit opt-in after the full suite: -Dtest=AuditPostmanVerification. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "server.address=127.0.0.1")
class AuditPostmanVerification extends LaboratoryTestSupport {
    @Value("${local.server.port}") int port;
    @Autowired LabTestService catalog;
    @TempDir Path temporary;

    @Test
    void canonicalAuditReadShowsCommittedConfigurationAndLaboratoryHistoryButNoRolledBackChange() throws Exception {
        assertEquals("smartlims_auth_regression", jdbc.queryForObject("SELECT current_database()", String.class));
        assertEquals(55432, jdbc.queryForObject("SELECT inet_server_port()", Integer.class));
        assertEquals("smartlims-disposable-regression-20261031", jdbc.queryForObject("SELECT current_setting('cluster_name')", String.class));
        assertEquals(System.getenv("SMARTLIMS_TEST_POSTGRES_DATA").replace('\\', '/').toLowerCase(Locale.ROOT),
                jdbc.queryForObject("SELECT current_setting('data_directory')", String.class).replace('\\', '/').toLowerCase(Locale.ROOT));
        var definition = new LabTestRequest("PM_AUDIT", "Private synthetic definition", "PRIVATE_AUDIT_PAYLOAD", BigDecimal.ONE, "ILS", "SYNTHETIC", "PRIVATE_AUDIT_PAYLOAD", List.of());
        var test = catalog.create(actor(Role.ADMIN), definition);
        var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS).plusSeconds(86400);
        var slot = schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(600).toString(), 2, true));
        var rollback = new AtomicReference<UUID>();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            rollback.set(catalog.create(actor(Role.ADMIN), new LabTestRequest("PM_ROLLBACK", "Private rollback", null, BigDecimal.ONE, "ILS", "SYNTHETIC", null, List.of())).id());
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE entity_id=?", Long.class, rollback.get()));
            status.setRollbackOnly();
        });
        assertFalse(tests.existsByCode("PM_ROLLBACK"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE entity_id=?", Long.class, rollback.get()));
        prepared(create(own, first));
        long expected = jdbc.queryForObject("SELECT (SELECT count(*) FROM audit_logs)+(SELECT count(*) FROM laboratory_events)", Long.class);
        var runtime = new LinkedHashMap<String, String>();
        runtime.put("baseUrl", "http://127.0.0.1:" + port); runtime.put("disposableConfirmed", "true");
        runtime.put("adminToken", tokens.get(Role.ADMIN)); runtime.put("patientToken", tokens.get(Role.PATIENT));
        runtime.put("receptionistToken", tokens.get(Role.RECEPTIONIST)); runtime.put("labTechnicianToken", tokens.get(Role.LAB_TECHNICIAN));
        runtime.put("catalogId", test.id().toString()); runtime.put("slotId", slot.id().toString());
        runtime.put("rollbackId", rollback.get().toString()); runtime.put("adminId", actors.get(Role.ADMIN).getId().toString());
        runtime.put("today", LocalDate.now(com.smartlims.laboratory.dto.HistoryDates.ZONE).toString());
        runtime.put("expectedTotal", Long.toString(expected));
        runtime.put("expectedCreates", jdbc.queryForObject("SELECT (SELECT count(*) FROM audit_logs WHERE action='CREATE')+(SELECT count(*) FROM laboratory_events WHERE kind='CREATE')", Long.class).toString());
        Path log = temporary.resolve("newman.log");
        var process = new ProcessBuilder("node", "postman/run-audit.cjs").redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try (var input = process.getOutputStream()) { input.write(json.writeValueAsBytes(runtime)); }
        if (!process.waitFor(180, TimeUnit.SECONDS)) { process.destroyForcibly(); fail("Audit local verification timed out"); }
        System.out.println(Files.readString(log));
        assertEquals(0, process.exitValue(), "See sanitized postman/audit-run-summary.json");
        assertEquals(expected, jdbc.queryForObject("SELECT (SELECT count(*) FROM audit_logs)+(SELECT count(*) FROM laboratory_events)", Long.class));
    }
}
