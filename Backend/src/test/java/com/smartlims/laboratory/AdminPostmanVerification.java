package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.HistoryDates;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import static org.junit.jupiter.api.Assertions.*;

/** Explicit opt-in, after Maven suite: -Dtest=AdminPostmanVerification. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "server.address=127.0.0.1")
class AdminPostmanVerification extends LaboratoryTestSupport {
    @Value("${local.server.port}") int port;
    @TempDir Path temporary;

    @Test
    void runExactSavedRequestsAndMemoryOnlyScenariosAgainstGuardedLocalApp() throws Exception {
        assertEquals("smartlims_auth_regression", jdbc.queryForObject("SELECT current_database()", String.class));
        assertEquals(55432, jdbc.queryForObject("SELECT inet_server_port()", Integer.class));
        assertEquals("smartlims-disposable-regression-20261031", jdbc.queryForObject("SELECT current_setting('cluster_name')", String.class));
        assertEquals(System.getenv("SMARTLIMS_TEST_POSTGRES_DATA").replace('\\', '/').toLowerCase(Locale.ROOT),
                jdbc.queryForObject("SELECT current_setting('data_directory')", String.class).replace('\\', '/').toLowerCase(Locale.ROOT));
        var order = create(own, first, free);
        var appointment = appointment(order, 0, 3);
        prepared(create(other, first));
        var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).plusSeconds(4 * 86400);
        var runtime = new LinkedHashMap<String, String>();
        runtime.put("baseUrl", "http://127.0.0.1:" + port);
        runtime.put("disposableConfirmed", "true");
        runtime.put("adminToken", tokens.get(Role.ADMIN));
        runtime.put("receptionistToken", tokens.get(Role.RECEPTIONIST));
        runtime.put("patientToken", tokens.get(Role.PATIENT));
        runtime.put("slotId", appointment.slotId().toString());
        runtime.put("startsAt", start.toString()); runtime.put("endsAt", start.plusSeconds(1800).toString());
        runtime.put("appointmentFrom", start.minusSeconds(5 * 86400).toString());
        runtime.put("appointmentTo", start.plusSeconds(86400).toString());
        runtime.put("today", LocalDate.now(HistoryDates.ZONE).toString());
        runtime.put("actorId", actors.get(Role.LAB_TECHNICIAN).getId().toString());
        runtime.put("orderNumber", order.orderNumber());
        long eventsBefore = jdbc.queryForObject("SELECT count(*) FROM laboratory_events", Long.class);
        Path log = temporary.resolve("newman.log");
        var process = new ProcessBuilder("node", "postman/run-admin.cjs").redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try (var input = process.getOutputStream()) { input.write(json.writeValueAsBytes(runtime)); }
        if (!process.waitFor(180, TimeUnit.SECONDS)) { process.destroyForcibly(); fail("Admin Postman verification timed out"); }
        System.out.println(Files.readString(log));
        assertEquals(0, process.exitValue(), "See sanitized postman/admin-run-summary.json");
        assertEquals(eventsBefore, jdbc.queryForObject("SELECT count(*) FROM laboratory_events", Long.class));
        assertEquals("CONFIRMED", jdbc.queryForObject("SELECT status FROM appointments WHERE id=?", String.class, appointment.id()));
        assertEquals(appointment.slotId(), jdbc.queryForObject("SELECT slot_id FROM appointments WHERE id=?", UUID.class, appointment.id()));
        assertEquals(java.sql.Timestamp.from(appointment.startsAt()), jdbc.queryForObject("SELECT starts_at FROM appointment_slots WHERE id=?", java.sql.Timestamp.class, appointment.slotId()));
    }
}
