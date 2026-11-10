package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.HistoryDates;
import com.smartlims.results.dto.ResultRequests;
import com.smartlims.samples.dto.SampleRequests;
import java.nio.file.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import static org.junit.jupiter.api.Assertions.*;

/** Explicit opt-in after the full Maven suite; tokens are supplied to Newman only via stdin. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "server.address=127.0.0.1")
class DashboardPostmanVerification extends LaboratoryTestSupport {
    @Value("${local.server.port}") int port;
    @TempDir Path temporary;

    @Test
    void verifyExactCanonicalRequestsAgainstGuardedLocalServer() throws Exception {
        assertEquals("smartlims_auth_regression", jdbc.queryForObject("SELECT current_database()", String.class));
        assertEquals(55432, jdbc.queryForObject("SELECT inet_server_port()", Integer.class));
        assertEquals("127.0.0.1", jdbc.queryForObject("SELECT host(inet_server_addr())", String.class));
        assertEquals("smartlims-disposable-regression-20261031", jdbc.queryForObject("SELECT current_setting('cluster_name')", String.class));
        assertEquals(System.getenv("SMARTLIMS_TEST_POSTGRES_DATA").replace('\\', '/').toLowerCase(Locale.ROOT),
                jdbc.queryForObject("SELECT current_setting('data_directory')", String.class).replace('\\', '/').toLowerCase(Locale.ROOT));
        var order = create(own, first, free);
        appointment(order, 0, 3);
        var published = publish(prepared(create(other, first)).result());
        publicationService.correct(actor(Role.LAB_TECHNICIAN), published.id().toString(),
                new ResultRequests.Correction("Synthetic dashboard correction"), List.of(UUID.randomUUID().toString()));
        var sampleOrder = create(unlinked, free);
        var visit = arrive(sampleOrder, null);
        var sample = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "SYNTHETIC", null, null, null), List.of(UUID.randomUUID().toString())).sample();
        sampleService.reject(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Reject(0L, "PRIVATE_DASHBOARD_REASON"));
        sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "SYNTHETIC", null, null, sample.id().toString()), List.of(UUID.randomUUID().toString()));
        var cancelled = create(own, free); state(cancelled.id(), "CANCELLED");
        var today = LocalDate.now(HistoryDates.ZONE);
        jdbc.update("UPDATE test_orders SET created_at=? WHERE id=?", Timestamp.from(today.minusDays(7).atStartOfDay(HistoryDates.ZONE).toInstant()), order.id());
        first.setName("PRIVATE_CURRENT_CATALOG_NAME"); tests.saveAndFlush(first);
        var runtime = new LinkedHashMap<String, String>();
        runtime.put("dashboard", "true"); runtime.put("disposableConfirmed", "true");
        runtime.put("baseUrl", "http://127.0.0.1:" + port);
        runtime.put("orderId", order.id().toString()); runtime.put("orderNumber", order.orderNumber());
        runtime.put("cancelledId", cancelled.id().toString());
        runtime.put("missingId", UUID.randomUUID().toString());
        tokens.forEach((role, token) -> runtime.put(switch (role) {
            case ADMIN -> "adminToken"; case PATIENT -> "patientToken";
            case RECEPTIONIST -> "receptionistToken"; case LAB_TECHNICIAN -> "labTechnicianToken";
        }, token));
        long before = jdbc.queryForObject("SELECT (SELECT count(*) FROM audit_logs)+(SELECT count(*) FROM laboratory_events)", Long.class);
        var log = temporary.resolve("newman-dashboard.log");
        var process = new ProcessBuilder("node", "postman/run-admin.cjs").redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try (var input = process.getOutputStream()) { input.write(json.writeValueAsBytes(runtime)); }
        if (!process.waitFor(180, TimeUnit.SECONDS)) { process.destroyForcibly(); fail("Dashboard Postman verification timed out"); }
        System.out.println(Files.readString(log));
        assertEquals(0, process.exitValue(), "Canonical request or local assertion failure");
        assertEquals(before, jdbc.queryForObject("SELECT (SELECT count(*) FROM audit_logs)+(SELECT count(*) FROM laboratory_events)", Long.class));
        assertEquals(4, orders.count());
    }
}
