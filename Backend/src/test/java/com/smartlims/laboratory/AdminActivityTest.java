package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.entity.LaboratoryEvent;
import com.smartlims.laboratory.repository.LaboratoryEventRepository;
import com.smartlims.laboratory.service.AdminActivityService;
import com.smartlims.orders.service.AdminOrderReadService;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdminActivityTest extends LaboratoryTestSupport {
    @Autowired AdminActivityService activity;
    @Autowired AdminOrderReadService adminOrders;
    @Autowired LaboratoryEventRepository events;

    private LaboratoryQuery query(String... pairs) {
        var values = new LinkedHashMap<String, List<String>>();
        for (int i = 0; i < pairs.length; i += 2) values.put(pairs[i], List.of(pairs[i + 1]));
        return LaboratoryQuery.of(values, "fromDate", "toDate", "status", "actorId", "action", "search");
    }

    @Test
    void newRoutesAreAdminOnlyAndReadOnly() throws Exception {
        for (String path : List.of("/api/audit-logs", "/api/orders", "/api/reports/operations")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(bearer(get(path), Role.ADMIN)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
            for (Role role : List.of(Role.PATIENT, Role.RECEPTIONIST, Role.LAB_TECHNICIAN))
                mvc.perform(bearer(get(path), role)).andExpect(status().isForbidden());
            if (!path.equals("/api/orders"))
                mvc.perform(bearer(post(path), Role.ADMIN)).andExpect(status().isForbidden());
        }
        assertEquals(0, jdbc.queryForObject("select count(*) from laboratory_events", Integer.class));
    }

    @Test
    void storedEligibilityAndRoleAreRecheckedAtServiceBoundary() {
        var forged = actor(actors.get(Role.PATIENT).getId(), Role.ADMIN);
        assertThrows(RuntimeException.class, () -> activity.audit(forged, query()));
        assertThrows(RuntimeException.class, () -> activity.report(forged, query()));
        assertThrows(RuntimeException.class, () -> adminOrders.list(forged, query()));
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", actors.get(Role.ADMIN).getId());
        assertThrows(RuntimeException.class, () -> activity.audit(actor(Role.ADMIN), query()));
        assertThrows(RuntimeException.class, () -> activity.report(actor(Role.ADMIN), query()));
        assertThrows(RuntimeException.class, () -> adminOrders.list(actor(Role.ADMIN), query()));
    }

    @Test
    void strictFiltersAndDateErrorsUseExistingEnvelope() throws Exception {
        for (String path : List.of("/api/audit-logs", "/api/orders", "/api/reports/operations")) {
            for (String value : List.of("", "2026-02-30", "2026-1-01", "0000-01-01", "2026-11-10T00:00:00Z"))
                error(mvc.perform(bearer(get(path).param("fromDate", value), Role.ADMIN)), 400, "VALIDATION_ERROR", "fromDate");
            error(mvc.perform(bearer(get(path).param("fromDate", "2026-11-11").param("toDate", "2026-11-10"), Role.ADMIN)), 400, "VALIDATION_ERROR", "toDate");
            error(mvc.perform(bearer(get(path).param("toDate", "2026-11-10", "2026-11-10"), Role.ADMIN)), 400, "VALIDATION_ERROR", "toDate");
            error(mvc.perform(bearer(get(path).param("patientId", own.getId().toString()), Role.ADMIN)), 400, "VALIDATION_ERROR", "patientId");
        }
        for (String path : List.of("/api/audit-logs", "/api/orders")) {
            error(mvc.perform(bearer(get(path).param("search", "x".repeat(151)), Role.ADMIN)), 400, "VALIDATION_ERROR", "search");
            error(mvc.perform(bearer(get(path).param("page", "0", "1"), Role.ADMIN)), 400, "VALIDATION_ERROR", "page");
            error(mvc.perform(bearer(get(path).param("size", "101"), Role.ADMIN)), 400, "VALIDATION_ERROR", "size");
        }
        error(mvc.perform(bearer(get("/api/orders").param("status", "New"), Role.ADMIN)), 400, "VALIDATION_ERROR", "status");
        error(mvc.perform(bearer(get("/api/audit-logs").param("actorId", "1"), Role.ADMIN)), 400, "VALIDATION_ERROR", "actorId");
        error(mvc.perform(bearer(get("/api/audit-logs").param("action", "DELETE"), Role.ADMIN)), 400, "VALIDATION_ERROR", "action");
        error(mvc.perform(bearer(get("/api/reports/operations").param("page", "0"), Role.ADMIN)), 400, "VALIDATION_ERROR", "page");
    }

    private void event(UUID sample, UUID id, String recorded, String actor, String kind, String reason) {
        jdbc.update("INSERT INTO laboratory_events(id,sample_id,kind,actor_id,actor_name_snapshot,occurred_at,recorded_at,reason) VALUES (?,?,?,?,?,?,?,?)",
                id, sample, kind, actors.get(Role.valueOf(actor)).getId(), "Retained synthetic actor", Timestamp.from(Instant.parse(recorded).minusSeconds(3600)), Timestamp.from(Instant.parse(recorded)), reason);
    }

    @Test
    void auditDateActorActionSearchAndStablePaginationPreserveSafeProjection() throws Exception {
        var p = prepared(create(own, first));
        UUID low = UUID.fromString("00000000-0000-0000-0000-000000000001"), high = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
        event(p.sample().id(), low, "2026-10-24T21:00:00Z", "ADMIN", "REJECT", "PRIVATE synthetic reason");
        event(p.sample().id(), high, "2026-10-24T21:00:00Z", "ADMIN", "REJECT", "PRIVATE synthetic reason");
        event(p.sample().id(), UUID.randomUUID(), "2026-10-25T22:00:00Z", "ADMIN", "REJECT", "PRIVATE synthetic reason");
        event(p.sample().id(), UUID.randomUUID(), "2026-10-24T21:00:00Z", "RECEPTIONIST", "RECEIVE", null);
        // Jerusalem DST fall-back day is 25 hours: [Oct24 21Z, Oct25 22Z).
        var q = query("fromDate", "2026-10-25", "toDate", "2026-10-25", "actorId", actors.get(Role.ADMIN).getId().toString(), "action", "REJECT", "size", "1");
        var page = activity.audit(actor(Role.ADMIN), q);
        assertEquals(2, page.totalElements()); assertEquals(high, page.content().getFirst().id());
        assertEquals("Rejected a sample.", page.content().getFirst().details());
        assertTrue(page.actions().contains("CREATE"));
        assertTrue(page.actors().stream().anyMatch(a -> a.id().equals(actors.get(Role.LAB_TECHNICIAN).getId())));
        var next = new LinkedHashMap<>(q.values()); next.put("page", List.of("1"));
        assertEquals(low, activity.audit(actor(Role.ADMIN), LaboratoryQuery.of(next, "fromDate", "toDate", "actorId", "action")).content().getFirst().id());
        assertEquals(0, activity.audit(actor(Role.ADMIN), query("search", "PRIVATE")).totalElements());
        assertEquals(0, activity.audit(actor(Role.ADMIN), query("search", "%")).totalElements());
        assertTrue(activity.audit(actor(Role.ADMIN), query("search", p.sample().id().toString().toUpperCase(Locale.ROOT))).totalElements() >= 3);
        assertEquals(0, activity.audit(actor(Role.ADMIN), query("actorId", UUID.randomUUID().toString())).totalElements());
        var huge = activity.audit(actor(Role.ADMIN), query("page", "2147483647", "size", "100"));
        assertTrue(huge.last()); assertTrue(huge.content().isEmpty()); assertTrue(huge.totalElements() > 0);
        String body = mvc.perform(bearer(get("/api/audit-logs"), Role.ADMIN)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (String secret : List.of("PRIVATE", "reason", "password", "explanation", "patientName", "resultValues")) assertFalse(body.contains(secret));
    }

    @Test
    void realWorkflowEventsAreReusedAndListAddsNothing() {
        var p = prepared(create(own, first));
        publish(p.result());
        long before = events.count();
        var page = activity.audit(actor(Role.ADMIN), query());
        assertEquals(before, page.totalElements());
        assertTrue(page.actions().containsAll(List.of("ARRIVAL", "REGISTER", "RECEIVE", "ATTEST", "CREATE", "EDIT", "APPROVE", "PUBLISH")));
        assertEquals(before, events.count());
        assertTrue(page.coverage().contains("not recorded"));
    }

    @Test
    void orderSearchUsesSnapshotsWithoutDuplicateRowsOrInflatedFilteredTotals() {
        var a = create(own, first, free); var b = create(other, first); create(unlinked, free);
        first.setName("Renamed current catalog"); first.setPrice(new BigDecimal("99.99")); tests.saveAndFlush(first);
        var all = adminOrders.list(actor(Role.ADMIN), query("search", "SYNTHETIC", "size", "1"));
        assertEquals(3, all.totalElements()); assertEquals(3, all.summary().totalOrders());
        assertEquals(new BigDecimal("24.68"), all.summary().orderValue());
        var snapshots = adminOrders.list(actor(Role.ADMIN), query("search", "first test"));
        assertEquals(2, snapshots.totalElements());
        assertTrue(snapshots.content().stream().flatMap(o -> o.items().stream()).anyMatch(i -> i.testName().equals("Synthetic first test") && i.priceAtOrder().equals(new BigDecimal("12.34"))));
        assertEquals(0, adminOrders.list(actor(Role.ADMIN), query("search", "Renamed current catalog")).totalElements());
        assertEquals(1, adminOrders.list(actor(Role.ADMIN), query("search", a.orderNumber())).totalElements());
        state(b.id(), "CANCELLED");
        var cancelled = adminOrders.list(actor(Role.ADMIN), query("status", "CANCELLED", "search", "first test"));
        assertEquals(1, cancelled.totalElements()); assertEquals(new BigDecimal("12.34"), cancelled.summary().orderValue());
        assertNull(cancelled.content().getFirst().paymentStatus()); assertFalse(cancelled.summary().financial().supported());
    }

    @Test
    void orderPatientAndLiteralSearchAndDateTiesAreDeterministic() {
        own.setFullName("Synthetic %_\\ profile"); patients.saveAndFlush(own);
        var a = create(own, first, free); var b = create(other, first);
        var at = Instant.parse("2026-10-24T21:00:00Z");
        jdbc.update("UPDATE test_orders SET created_at=? WHERE id IN (?,?)", Timestamp.from(at), a.id(), b.id());
        for (String s : List.of("%", "_", "\\", "SYNTHETIC %_\\"))
            assertEquals(1, adminOrders.list(actor(Role.ADMIN), query("search", s)).totalElements());
        var page = adminOrders.list(actor(Role.ADMIN), query("fromDate", "2026-10-25", "toDate", "2026-10-25", "size", "1"));
        var expected = jdbc.queryForObject("SELECT id FROM test_orders ORDER BY created_at DESC,id DESC LIMIT 1", UUID.class);
        assertEquals(expected, page.content().getFirst().id()); assertEquals(2, page.totalElements());
        assertEquals(0, adminOrders.list(actor(Role.ADMIN), query("fromDate", "2026-10-26")).totalElements());
        var huge = adminOrders.list(actor(Role.ADMIN), query("page", "2147483647", "size", "100"));
        assertEquals(2, huge.totalElements()); assertTrue(huge.last()); assertTrue(huge.content().isEmpty());
    }

    @Test
    void reportCountsItemsInsteadOfVersionsAndKeepsPublicationDuringCorrection() {
        create(own, free); // New item.
        var cancelled = create(other, first, free); state(cancelled.id(), "CANCELLED");
        var pending = create(unlinked, first, free); arrive(pending, null); // Both selected items in progress.
        var p = prepared(create(own, first));
        var published = publish(p.result());
        publicationService.correct(actor(Role.LAB_TECHNICIAN), published.id().toString(),
                new com.smartlims.results.dto.ResultRequests.Correction("Synthetic correction"), List.of(UUID.randomUUID().toString()));
        var report = activity.report(actor(Role.ADMIN), query());
        assertEquals(4, report.ordersByStatus().stream().mapToLong(s -> s.count()).sum());
        assertEquals(6, report.testsByStatus().stream().mapToLong(s -> s.count()).sum());
        assertEquals(List.of(1L, 2L, 1L, 2L), report.testsByStatus().stream().map(s -> s.count()).toList());
        assertEquals(new BigDecimal("16.7"), report.testsByStatus().getFirst().share());
        assertEquals(5, report.sourceDetails().size());
        assertEquals(FinancialSummary.unsupported(), report.financial());
        assertEquals(adminOrders.list(actor(Role.ADMIN), query()).summary().financial(), report.financial());
    }

    @Test
    void attendanceUsesStoredStatesAndCurrentSlotDateIncludingCancellationsSeparately() {
        var ids = new ArrayList<UUID>();
        for (int n = 0; n < 5; n++) ids.add(appointment(create(unlinked, free), n, 2).id());
        jdbc.update("UPDATE appointments SET status='CHECKED_IN',checked_in_at=now(),checked_in_by=? WHERE id=?", actors.get(Role.RECEPTIONIST).getId(), ids.get(1));
        jdbc.update("UPDATE appointments SET status='COMPLETED',checked_in_at=now(),checked_in_by=?,completed_at=now(),completed_by=? WHERE id=?", actors.get(Role.RECEPTIONIST).getId(), actors.get(Role.RECEPTIONIST).getId(), ids.get(2));
        jdbc.update("UPDATE appointments SET status='NO_SHOW',no_show_at=now(),no_show_by=? WHERE id=?", actors.get(Role.RECEPTIONIST).getId(), ids.get(3));
        jdbc.update("UPDATE appointments SET status='CANCELLED',cancelled_at=now(),cancelled_by=? WHERE id=?", actors.get(Role.RECEPTIONIST).getId(), ids.get(4));
        var today = LocalDate.now(HistoryDates.ZONE);
        var report = activity.report(actor(Role.ADMIN), query("fromDate", today.toString(), "toDate", today.toString()));
        assertEquals(0, report.appointments().scheduled()); // Booking creation date is irrelevant.
        var tomorrow = today.plusDays(1).toString();
        // All five slots fall within the next two local days regardless of the execution hour.
        report = activity.report(actor(Role.ADMIN), query("fromDate", tomorrow, "toDate", today.plusDays(2).toString()));
        assertEquals(new AdminActivityResponses.Attendance(4, 2, 1, 1, 1), report.appointments());
    }

    @Test
    void rejectionUsesRejectionDateRatherThanOrderCreationAndReturnsNoReason() {
        var order = create(own, first); var visit = arrive(order, null);
        var sample = sampleService.create(actor(Role.LAB_TECHNICIAN), new com.smartlims.samples.dto.SampleRequests.Create(visit.id().toString(), "SYNTHETIC", null, null, null), List.of(UUID.randomUUID().toString())).sample();
        sampleService.reject(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new com.smartlims.samples.dto.SampleRequests.Reject(0L, "Private synthetic reason"));
        jdbc.update("UPDATE test_orders SET created_at='2020-01-01T00:00:00Z' WHERE id=?", order.id());
        var report = activity.report(actor(Role.ADMIN), query());
        assertEquals(1, report.rejectedSamples()); assertEquals(0, report.ordersByStatus().stream().mapToLong(s -> s.count()).sum());
    }

    @Test
    void emptyReportHasRealZerosAndExplicitUnsupportedFinancialNulls() throws Exception {
        var report = activity.report(actor(Role.ADMIN), query());
        assertEquals(LocalDate.now(HistoryDates.ZONE).minusDays(29), report.period().fromDate());
        assertTrue(report.ordersByStatus().stream().allMatch(s -> s.count() == 0 && s.share().signum() == 0));
        assertTrue(report.testsByStatus().stream().allMatch(s -> s.count() == 0 && s.share().signum() == 0));
        assertNull(report.financial().confirmedPayments()); assertNull(report.financial().refunds());
        var zero = create(own, free);
        var page = adminOrders.list(actor(Role.ADMIN), query("search", zero.orderNumber()));
        assertEquals(new BigDecimal("0.00"), page.summary().orderValue()); assertNull(page.summary().financial().pendingPayments());
        mvc.perform(bearer(get("/api/reports/operations"), Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.financial.supported").value(false)).andExpect(jsonPath("$.financial.confirmedPayments").isEmpty());
    }

    @Test
    void deactivatingOccupiedSlotRetainsAppointmentsAndDerivedCounts() throws Exception {
        var order = create(own, free); var a = appointment(order, 0, 3);
        var closed = schedule.updateSlot(actor(Role.ADMIN), a.slotId().toString(), new com.smartlims.appointments.dto.AppointmentRequests.SlotUpdate(4, false));
        assertEquals(1, closed.capacity() - closed.remainingCapacity()); assertEquals(3, closed.remainingCapacity());
        assertEquals("CONFIRMED", jdbc.queryForObject("SELECT status FROM appointments WHERE id=?", String.class, a.id()));
        assertEquals(a.slotId(), jdbc.queryForObject("SELECT slot_id FROM appointments WHERE id=?", UUID.class, a.id()));
        assertEquals(a.startsAt(), closed.startsAt()); assertFalse(closed.active());
        mvc.perform(bearer(put("/api/appointment-slots/" + a.slotId()), Role.ADMIN).contentType("application/json")
                .content("{\"capacity\":4,\"active\":false,\"startsAt\":\"2030-01-01T00:00:00Z\"}"))
                .andExpect(status().isBadRequest());
    }
}
