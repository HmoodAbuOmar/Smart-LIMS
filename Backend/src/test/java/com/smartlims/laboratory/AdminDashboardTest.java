package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.repository.AdminDashboardQueries;
import com.smartlims.laboratory.service.AdminActivityService;
import com.smartlims.orders.service.AdminOrderReadService;
import com.smartlims.results.dto.ResultRequests;
import com.smartlims.samples.dto.SampleRequests;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdminDashboardTest extends LaboratoryTestSupport {
    @Autowired AdminActivityService activity;
    @Autowired AdminDashboardQueries dashboard;
    @Autowired AdminOrderReadService adminOrders;

    private LaboratoryQuery query(String... pairs) {
        var values = new LinkedHashMap<String, List<String>>();
        for (int i = 0; i < pairs.length; i += 2) values.put(pairs[i], List.of(pairs[i + 1]));
        return LaboratoryQuery.of(values, "days", "sort", "status", "search");
    }

    @Test
    void dashboardAndDetailAreAdminOnlyAndPatientOwnershipRemains() throws Exception {
        var order = create(own, first);
        long events = jdbc.queryForObject("SELECT count(*) FROM audit_logs", Long.class);
        for (String path : List.of("/api/admin/dashboard", "/api/orders/" + order.id())) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(bearer(get(path), Role.ADMIN)).andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "no-store"));
            for (Role role : List.of(Role.PATIENT, Role.RECEPTIONIST, Role.LAB_TECHNICIAN))
                mvc.perform(bearer(get(path), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(post(path), Role.ADMIN)).andExpect(status().isForbidden());
        }
        mvc.perform(bearer(get("/api/orders/me/" + order.id()), Role.ADMIN)).andExpect(status().isForbidden());
        mvc.perform(bearer(get("/api/orders/me/" + order.id()), Role.PATIENT)).andExpect(status().isOk());
        mvc.perform(get("/api/orders/me/" + order.id()).header("Authorization", "Bearer " + strangerToken)).andExpect(status().isNotFound());
        assertEquals(events, jdbc.queryForObject("SELECT count(*) FROM audit_logs", Long.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM laboratory_events", Long.class));
    }

    @Test
    void storedAccountRoleAndEligibilityAreRecheckedForBothReads() throws Exception {
        var order = create(own, first);
        var forged = actor(actors.get(Role.PATIENT).getId(), Role.ADMIN);
        assertThrows(RuntimeException.class, () -> activity.dashboard(forged, query()));
        assertThrows(RuntimeException.class, () -> adminOrders.get(forged, order.id().toString()));
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", actors.get(Role.ADMIN).getId());
        assertThrows(RuntimeException.class, () -> activity.dashboard(actor(Role.ADMIN), query()));
        assertThrows(RuntimeException.class, () -> adminOrders.get(actor(Role.ADMIN), order.id().toString()));
        mvc.perform(bearer(get("/api/admin/dashboard"), Role.ADMIN)).andExpect(status().isUnauthorized());
        mvc.perform(bearer(get("/api/orders/" + order.id()), Role.ADMIN)).andExpect(status().isUnauthorized());
    }

    @Test
    void strictDashboardSortAndDetailInputsUseExistingErrorEnvelope() throws Exception {
        for (String value : List.of("", "0", "07", "8", "30", "7.0", " 7", "-7"))
            error(mvc.perform(bearer(get("/api/admin/dashboard").param("days", value), Role.ADMIN)), 400, "VALIDATION_ERROR", "days");
        error(mvc.perform(bearer(get("/api/admin/dashboard").param("days", "7", "14"), Role.ADMIN)), 400, "VALIDATION_ERROR", "days");
        for (String field : List.of("page", "size", "fromDate", "toDate", "status"))
            error(mvc.perform(bearer(get("/api/admin/dashboard").param(field, "0"), Role.ADMIN)), 400, "VALIDATION_ERROR", field);
        for (String value : List.of("", "totalAmount,asc", "createdAt,DESC", "createdAt", "id,asc"))
            error(mvc.perform(bearer(get("/api/orders").param("sort", value), Role.ADMIN)), 400, "VALIDATION_ERROR", "sort");
        error(mvc.perform(bearer(get("/api/orders").param("sort", "createdAt,asc", "createdAt,desc"), Role.ADMIN)), 400, "VALIDATION_ERROR", "sort");
        for (String label : List.of("Received", "Processing", "Awaiting review"))
            error(mvc.perform(bearer(get("/api/orders").param("status", label), Role.ADMIN)), 400, "VALIDATION_ERROR", "status");
        error(mvc.perform(bearer(get("/api/orders/bad-id"), Role.ADMIN)), 400, "VALIDATION_ERROR", "id");
        error(mvc.perform(bearer(get("/api/orders/" + UUID.randomUUID()), Role.ADMIN)), 404, "ORDER_NOT_FOUND", null);
        var order = create(own, first);
        error(mvc.perform(bearer(get("/api/orders/" + order.id()).param("patientId", "anything"), Role.ADMIN)), 400, "VALIDATION_ERROR", "patientId");
    }

    @Test
    void emptyDashboardHasRealZeroSeriesAndUnsupportedNulls() throws Exception {
        for (int days : List.of(7, 14)) {
            var response = activity.dashboard(actor(Role.ADMIN), query("days", "" + days));
            assertEquals(3, response.summary().uniquePatients()); // Includes unlinked, not staff accounts.
            assertEquals(0, response.summary().orders()); assertEquals(0, response.summary().scheduledAppointments());
            assertEquals(0, response.summary().completedTests()); assertEquals(0, response.summary().pendingResults());
            assertEquals(days, response.charts().dailyOrders().size());
            assertTrue(response.charts().dailyOrders().stream().allMatch(d -> d.count() == 0));
            assertTrue(response.charts().testDistribution().isEmpty());
            assertEquals(0, response.charts().totalOrders()); assertEquals(0, response.charts().totalTests());
            assertEquals(0, response.alerts().rejectedSamples().count()); assertEquals(0, response.alerts().resultsAwaitingReview().count());
            assertFalse(response.alerts().ordersRequiringAttention().supported()); assertNull(response.alerts().ordersRequiringAttention().count());
            assertEquals(FinancialSummary.unsupported(), response.financial());
        }
        mvc.perform(bearer(get("/api/admin/dashboard"), Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.charts.days").value(7)).andExpect(jsonPath("$.timezone").value("Asia/Jerusalem"))
                .andExpect(jsonPath("$.alerts.ordersRequiringAttention.count").isEmpty())
                .andExpect(jsonPath("$.financial.confirmedPayments").isEmpty());
    }

    @Test
    void summaryReusesReportRulesAndCorrectionDoesNotMultiplyCompletedItems() {
        create(own, first, free);
        var cancelled = create(other, free); state(cancelled.id(), "CANCELLED");
        var working = create(unlinked, free); arrive(working, null);
        var complete = prepared(create(own, first));
        var published = publish(complete.result());
        publicationService.correct(actor(Role.LAB_TECHNICIAN), published.id().toString(),
                new ResultRequests.Correction("Synthetic correction"), List.of(UUID.randomUUID().toString()));
        appointment(create(unlinked, free), 0, 2);
        jdbc.update("UPDATE test_orders SET created_at='2020-01-01T00:00:00Z'");
        var result = activity.dashboard(actor(Role.ADMIN), query());
        assertEquals(new AdminDashboardResponse.Summary(3, 5, 1, 1, 4), result.summary());
        assertEquals(1, result.alerts().resultsAwaitingReview().count()); // Correction DRAFT even with publication.
        assertEquals(0, result.charts().totalOrders());
        var report = activity.report(actor(Role.ADMIN), LaboratoryQuery.of(Map.of("fromDate", List.of("2000-01-01")), "fromDate"));
        assertEquals(report.appointments().scheduled(), result.summary().scheduledAppointments());
        assertEquals(report.ordersByStatus().stream().mapToLong(s -> s.count()).sum(), result.summary().orders());
        assertEquals(report.testsByStatus().get(2).count(), result.summary().completedTests());
        assertEquals(report.testsByStatus().get(0).count() + report.testsByStatus().get(1).count(), result.summary().pendingResults());
        assertEquals(result.summary(), activity.dashboard(actor(Role.ADMIN), query("days", "14")).summary());
    }

    @Test
    void reviewAlertTracksDraftApprovalEditInvalidationAndPublication() {
        var p = prepared(create(own, first));
        assertEquals(1, activity.dashboard(actor(Role.ADMIN), query()).alerts().resultsAwaitingReview().count());
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), p.result().id().toString(), new ResultRequests.Revision(p.result().version()));
        assertEquals(0, activity.dashboard(actor(Role.ADMIN), query()).alerts().resultsAwaitingReview().count());
        var edited = draftService.edit(actor(Role.LAB_TECHNICIAN), approved.id().toString(), contents(approved, p.sample().id()));
        assertEquals(1, activity.dashboard(actor(Role.ADMIN), query()).alerts().resultsAwaitingReview().count());
        publish(edited);
        assertEquals(0, activity.dashboard(actor(Role.ADMIN), query()).alerts().resultsAwaitingReview().count());
        assertEquals(1, activity.dashboard(actor(Role.ADMIN), query()).summary().completedTests());
    }

    @Test
    void rejectedAlertRetainsOriginalsAfterReplacementWithoutExposingReasons() throws Exception {
        var order = create(own, first); var visit = arrive(order, null);
        var sample = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "SYNTHETIC", null, null, null), List.of(UUID.randomUUID().toString())).sample();
        sampleService.reject(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Reject(0L, "PRIVATE_DASHBOARD_REASON"));
        var replacement = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "SYNTHETIC", null, null, sample.id().toString()), List.of(UUID.randomUUID().toString())).sample();
        sampleService.receive(actor(Role.LAB_TECHNICIAN), replacement.id().toString(), new SampleRequests.Revision(0L));
        assertEquals(1, activity.dashboard(actor(Role.ADMIN), query()).alerts().rejectedSamples().count());
        assertTrue(activity.dashboard(actor(Role.ADMIN), query()).alerts().rejectedSamples().sourceDetails().contains("resolution is not tracked"));
        sampleService.reject(actor(Role.LAB_TECHNICIAN), replacement.id().toString(), new SampleRequests.Reject(1L, "PRIVATE_DASHBOARD_REASON"));
        assertEquals(2, activity.dashboard(actor(Role.ADMIN), query()).alerts().rejectedSamples().count());
        var body = mvc.perform(bearer(get("/api/admin/dashboard"), Role.ADMIN)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (String forbidden : List.of("PRIVATE_DASHBOARD_REASON", own.getId().toString(), "patientName", "specimenIds", "password", "numericValue")) assertFalse(body.contains(forbidden));
    }

    @Test
    void chartWindowsIncludeLocalBoundariesAndHistoricalItemSnapshots() {
        var today = LocalDate.now(HistoryDates.ZONE);
        var start7 = today.minusDays(6).atStartOfDay(HistoryDates.ZONE).toInstant();
        var start14 = today.minusDays(13).atStartOfDay(HistoryDates.ZONE).toInstant();
        var end = today.plusDays(1).atStartOfDay(HistoryDates.ZONE).toInstant();
        var a = create(own, first, free); var b = create(own, first); var c = create(other, free);
        var d = create(unlinked, first); var e = create(own, first);
        for (var pair : List.of(Map.entry(a.id(), start7), Map.entry(b.id(), start7.minusNanos(1000)),
                Map.entry(c.id(), end.minusNanos(1000)), Map.entry(d.id(), end), Map.entry(e.id(), start14.minusNanos(1000))))
            jdbc.update("UPDATE test_orders SET created_at=? WHERE id=?", Timestamp.from(pair.getValue()), pair.getKey());
        state(c.id(), "CANCELLED");
        first.setName("New catalog name"); first.setPrice(new BigDecimal("900.00")); tests.saveAndFlush(first);
        var renamed = create(own, first);
        var seven = activity.dashboard(actor(Role.ADMIN), query());
        assertEquals(today.minusDays(6), seven.charts().period().fromDate());
        assertEquals(today, seven.charts().period().toDate());
        assertEquals(3, seven.charts().totalOrders()); assertEquals(4, seven.charts().totalTests());
        assertEquals(1, seven.charts().dailyOrders().getFirst().count());
        assertEquals(2, seven.charts().dailyOrders().getLast().count());
        assertTrue(seven.charts().dailyOrders().subList(1, 6).stream().allMatch(v -> v.count() == 0));
        assertEquals(List.of(2L, 1L, 1L), seven.charts().testDistribution().stream().map(v -> v.count()).toList());
        assertEquals(new BigDecimal("50.0"), seven.charts().testDistribution().getFirst().share());
        assertEquals(Set.of("Synthetic free test", "Synthetic first test", "New catalog name"),
                new HashSet<>(seven.charts().testDistribution().stream().map(v -> v.testName()).toList()));
        var fourteen = activity.dashboard(actor(Role.ADMIN), query("days", "14"));
        assertEquals(4, fourteen.charts().totalOrders()); assertEquals(5, fourteen.charts().totalTests());
        assertEquals(14, fourteen.charts().dailyOrders().size());
        assertEquals(renamed.items().getFirst().labTestId(), seven.charts().testDistribution().stream().filter(v -> v.testName().equals("New catalog name")).findFirst().orElseThrow().labTestId());
    }

    @Test
    void dailyAggregationHandlesBothDstTransitionsWithoutUtcDayLeakage() {
        var order = create(own, first);
        for (LocalDate day : List.of(LocalDate.of(2026, 10, 25), LocalDate.of(2026, 3, 27))) {
            var dates = new HistoryDates(day, day);
            assertNotEquals(Duration.ofHours(24), Duration.between(dates.start(), dates.end()));
            for (var instant : List.of(dates.start(), dates.end().minusNanos(1000))) {
                jdbc.update("UPDATE test_orders SET created_at=? WHERE id=?", Timestamp.from(instant), order.id());
                assertEquals(List.of(new AdminDashboardResponse.DailyOrders(day, 1)), dashboard.dailyOrders(dates));
                assertEquals(1, dashboard.distribution(dates).getFirst().count());
            }
            for (var instant : List.of(dates.start().minusNanos(1000), dates.end())) {
                jdbc.update("UPDATE test_orders SET created_at=? WHERE id=?", Timestamp.from(instant), order.id());
                assertEquals(List.of(new AdminDashboardResponse.DailyOrders(day, 0)), dashboard.dailyOrders(dates));
                assertTrue(dashboard.distribution(dates).isEmpty());
            }
        }
    }

    @Test
    void recentOrdersSortingPaginationAndViewPreserveSnapshotsAndFilteredTotals() throws Exception {
        var a = create(own, first, free); var b = create(own, first); var c = create(other, free);
        jdbc.update("UPDATE test_orders SET created_at='2026-10-25T00:00:00Z',updated_at='2026-10-25T00:00:00Z'");
        var ties = List.of(a.id(), b.id(), c.id()).stream().sorted(Comparator.comparing(UUID::toString).reversed()).toList();
        for (String sort : List.of("createdAt,asc", "createdAt,desc", "updatedAt,asc", "updatedAt,desc")) {
            assertEquals(ties, adminOrders.list(actor(Role.ADMIN), query("sort", sort)).content().stream().map(v -> v.id()).toList());
            assertEquals(ties.get(1), adminOrders.list(actor(Role.ADMIN), query("sort", sort, "page", "1", "size", "1")).content().getFirst().id());
        }
        for (String direction : List.of("asc", "desc")) {
            var result = adminOrders.list(actor(Role.ADMIN), query("sort", "orderNumber," + direction, "search", "first test", "status", "PENDING", "size", "1"));
            assertEquals(2, result.totalElements()); assertEquals(new BigDecimal("24.68"), result.summary().orderValue());
            assertEquals(direction.equals("asc") ? a.id() : b.id(), result.content().getFirst().id());
        }
        first.setName("Renamed catalog"); first.setPrice(new BigDecimal("100.00")); tests.saveAndFlush(first);
        mvc.perform(bearer(get("/api/orders/" + a.id()), Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.testCount").value(2)).andExpect(jsonPath("$.totalAmount").value(12.34))
                .andExpect(jsonPath("$.patientId").value(own.getId().toString()))
                .andExpect(jsonPath("$.items[1].testName").value("Synthetic first test"));
        mvc.perform(bearer(get("/api/orders").param("sort", "orderNumber,asc"), Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(a.id().toString()));
    }
}
