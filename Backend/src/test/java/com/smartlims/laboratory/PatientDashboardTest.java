package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.patients.dto.PatientDashboardResponse;
import com.smartlims.patients.service.PatientDashboardService;
import com.smartlims.results.dto.ResultRequests;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PatientDashboardTest extends MedicalHistoryTestSupport {
    private static final String URL = "/api/patients/me/dashboard";
    @Autowired
    PatientDashboardService dashboard;

    PatientDashboardResponse read() throws Exception {
        var response = mvc.perform(bearer(get(URL), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        return json.readValue(response.getContentAsByteArray(), PatientDashboardResponse.class);
    }

    @Test
    void emptyLinkedDashboardUsesProfileNameAndRealZeroUnreadNotifications() throws Exception {
        var result = read();
        assertEquals(own.getId(), result.patientId());
        assertEquals(own.getFullName(), result.displayName());
        assertNotEquals(actors.get(Role.PATIENT).getFullName(), result.displayName());
        assertEquals("Asia/Jerusalem", result.timeZone());
        assertNotNull(result.asOf());
        assertEquals(0, result.totalOrders());
        assertEquals(0, result.upcomingAppointmentCount());
        assertEquals(0, result.currentPublishedResultCount());
        assertTrue(result.recentOrders().isEmpty());
        assertTrue(result.latestResults().isEmpty());
        assertNull(result.nextAppointment());
        assertNull(result.healthTrendPreview());
        mvc.perform(bearer(get(URL), Role.PATIENT)).andExpect(jsonPath("$.notifications.available").value(true))
                .andExpect(jsonPath("$.notifications.unreadCount").value(0));
    }

    @Test
    void rolesStoredEligibilityProfileLinkAndCookieAuthenticationAreEnforced() throws Exception {
        mvc.perform(get(URL)).andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN))
            mvc.perform(bearer(get(URL), role)).andExpect(status().isForbidden());
        mvc.perform(get(URL).cookie(new jakarta.servlet.http.Cookie("access_token", tokens.get(Role.PATIENT))))
                .andExpect(status().isOk());
        assertThrows(com.smartlims.laboratory.exception.LaboratoryException.class,
                () -> dashboard.getMe(actor(actors.get(Role.ADMIN).getId(), Role.PATIENT)));
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", actors.get(Role.PATIENT).getId());
        mvc.perform(bearer(get(URL), Role.PATIENT)).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE users SET enabled=true WHERE id=?", actors.get(Role.PATIENT).getId());
        jdbc.update("UPDATE patients SET user_id=null WHERE id=?", own.getId());
        error(mvc.perform(bearer(get(URL), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        assertEquals(3, patients.count());
    }

    @Test
    void selectorsAndAllOtherQueryParametersAreRejected() throws Exception {
        for (String field : List.of("patientId", "userId", "page", "size", "sort", "seriesId"))
            error(mvc.perform(bearer(get(URL).param(field, "x", "y"), Role.PATIENT)), 400, "VALIDATION_ERROR", field);
    }

    @Test
    void catalogSuggestionsAreActiveBoundedStableAndNavigable() throws Exception {
        for (int i = 0; i < 5; i++)
            tests.saveAndFlush(new LabTest("EXTRA_" + i, "Same suggestion", null,
                    BigDecimal.ONE, "SYNTHETIC", null));
        jdbc.update("UPDATE lab_tests SET active=false WHERE id=?", first.getId());
        var expected = jdbc.queryForList("SELECT id FROM lab_tests WHERE active ORDER BY name,id LIMIT 4", UUID.class);
        var result = read();
        assertEquals(expected, result.catalogSuggestions().stream().map(t -> t.id()).toList());
        assertEquals(result.catalogSuggestions(), read().catalogSuggestions());
        for (var test : result.catalogSuggestions()) {
            assertTrue(test.active());
            mvc.perform(bearer(get("/api/lab-tests/" + test.id()), Role.PATIENT)).andExpect(status().isOk());
        }
        jdbc.update("UPDATE lab_tests SET active=false");
        assertTrue(read().catalogSuggestions().isEmpty());
    }

    @Test
    void recentOrdersCountAllStatesAndReturnRealMultipleVisitLinks() throws Exception {
        var visited = create(own, first);
        var a = arrive(visited, null);
        var b = arrive(visited, null);
        var pending = create(own, free);
        var cancelled = create(own, first);
        state(cancelled.id(), "CANCELLED");
        var completed = create(own, first);
        state(completed.id(), "COMPLETED");
        create(other, first);
        jdbc.update("UPDATE test_orders SET created_at='2026-01-01T00:00:00Z' WHERE patient_id=?", own.getId());
        jdbc.update("UPDATE test_orders SET created_at='2026-01-02T00:00:00Z' WHERE id=?", visited.id());
        var result = read();
        assertEquals(4, result.totalOrders());
        assertEquals(3, result.recentOrders().size());
        var expected = jdbc.queryForList("SELECT id FROM test_orders WHERE patient_id=? ORDER BY created_at DESC,id LIMIT 3", UUID.class, own.getId());
        assertEquals(expected, result.recentOrders().stream().map(r -> r.order().id()).toList());
        var row = result.recentOrders().getFirst();
        assertEquals(visited.id(), row.order().id());
        assertEquals(1, row.order().testCount());
        assertEquals(new BigDecimal("12.34"), row.order().totalAmount());
        assertTrue(row.order().visitDetailsAvailable());
        assertEquals(Set.of(a.id(), b.id()),
                new HashSet<>(row.visits().stream().map(v -> v.id()).toList()));
        for (var link : row.visits())
            mvc.perform(bearer(get(link.visitUrl()), Role.PATIENT)).andExpect(status().isOk());
        for (var order : result.recentOrders())
            mvc.perform(bearer(get("/api/orders/me/" + order.order().id()), Role.PATIENT)).andExpect(status().isOk());
        mvc.perform(bearer(get("/api/visits/me").param("orderId", visited.id().toString()), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(2));
        assertNotNull(pending);
        assertNotNull(completed);
    }

    @Test
    void upcomingCountsAndNextAppointmentExcludePastCancelledCheckedInAndForeign() throws Exception {
        var later = appointment(create(own, first), 4, 3);
        var earliest = appointment(create(own, free), 2, 3);
        appointment(create(other, first), 0, 3);
        var cancelled = appointment(create(own, first), 1, 3);
        jdbc.update("UPDATE appointments SET status='CANCELLED',cancelled_at=created_at,cancelled_by=?,cancellation_reason='Synthetic' WHERE id=?", actors.get(Role.ADMIN).getId(), cancelled.id());
        var past = appointment(create(own, first), 3, 3);
        jdbc.update("UPDATE appointment_slots SET starts_at=CURRENT_TIMESTAMP-interval '2 hours',ends_at=CURRENT_TIMESTAMP-interval '1 hour' WHERE id=?", past.slotId());
        var checked = create(own, first);
        var checkAppointment = appointment(checked, 5, 3);
        arrive(checked, checkAppointment.id());
        var result = read();
        assertEquals(2, result.upcomingAppointmentCount());
        assertEquals(earliest.id(), result.nextAppointment().id());
        assertEquals(earliest.typeName(), result.nextAppointment().typeName());
        assertEquals(earliest.startsAt().atZone(ZoneId.of("Asia/Jerusalem")).getOffset().toString(), result.nextAppointment().utcOffset());
        assertTrue(result.nextAppointment().startsAt().isAfter(result.asOf()));
        mvc.perform(bearer(get("/api/appointments/me").param("tab", "UPCOMING"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(bearer(get("/api/appointments/me/" + earliest.id()), Role.PATIENT)).andExpect(status().isOk());
        assertNotEquals(later.id(), result.nextAppointment().id());
    }

    @Test
    void latestPublishedResultsUsePublicationOrderSnapshotsAndRealActionUrls() throws Exception {
        var published = new ArrayList<UUID>();
        for (int i = 0; i < 4; i++)
            published.add(publish(measurement(own, first,
                    "2026-10-1" + i + "T07:00:00Z", "1", "NORMAL", true).result()).id());
        publish(measurement(other, first, "2026-10-14T07:00:00Z", "999", "HIGH", true).result());
        var draft = measurement(own, first, "2026-10-15T07:00:00Z", "2", "NORMAL", true).result();
        publicationService.approve(actor(reviewerId, Role.ADMIN), draft.id().toString(), new ResultRequests.Revision(draft.version()));
        jdbc.update("UPDATE lab_tests SET name='Changed live name',active=false WHERE id=?", first.getId());
        var result = read();
        assertEquals(4, result.currentPublishedResultCount());
        assertEquals(3, result.latestResults().size());
        assertEquals(published.reversed().subList(0, 3), result.latestResults().stream().map(r -> r.resultId()).toList());
        for (var row : result.latestResults()) {
            assertEquals(first.getName(), row.testName());
            assertEquals(first.getId(), row.labTestId());
            assertEquals(row.publishedAt().atZone(ZoneId.of("Asia/Jerusalem")).toLocalDate(), row.publicationDate());
            mvc.perform(bearer(get(row.resultUrl()), Role.PATIENT)).andExpect(status().isOk());
            mvc.perform(bearer(get(row.reportUrl()), Role.PATIENT)).andExpect(status().isOk()).andExpect(content().contentType("application/pdf"));
        }
        mvc.perform(bearer(get("/api/results/me").param("tab", "AVAILABLE"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(4));
    }

    @Test
    void currentCorrectionReplacesCountCardAndTrendWithoutLeakingWorkingValues() throws Exception {
        var f = measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true);
        var original = publish(f.result());
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), original.id().toString(), new ResultRequests.Correction("Synthetic correction"), keys()).result();
        var before = read();
        assertEquals(1, before.currentPublishedResultCount());
        assertEquals(original.id(), before.latestResults().getFirst().resultId());
        var replacement = publish(fill(correction, List.of(f.sample().id()), "2026-10-10T07:00:00Z", "2", "HIGH", null));
        state(f.order().id(), "CANCELLED");
        var after = read();
        assertEquals(1, after.currentPublishedResultCount());
        assertEquals(replacement.id(), after.latestResults().getFirst().resultId());
        assertEquals(replacement.id(), after.healthTrendPreview().latest().resultId());
        assertEquals(1, after.healthTrendPreview().series().measurementCount());
        mvc.perform(get(URL).header("Authorization", "Bearer " + strangerToken)).andExpect(jsonPath("$.currentPublishedResultCount").value(0))
                .andExpect(jsonPath("$.healthTrendPreview").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void trendPreviewUsesLatestCompatibleSeriesAndSixChronologicalPoints() throws Exception {
        for (int i = 0; i < 8; i++)
            publish(measurement(own, first, "2026-10-1" + i + "T07:00:00Z", Integer.toString(i), "NORMAL", true).result());
        publish(measurement(own, free, "2026-10-11T07:00:00Z", "888", "NORMAL", true).result());
        var preview = read().healthTrendPreview();
        var full = trend(preview.series().seriesId(), "period", "ALL");
        assertEquals(8, preview.series().measurementCount());
        assertEquals(6, preview.chartData().size());
        assertEquals(full.chartData().subList(2, 8), preview.chartData());
        assertEquals(full.latest(), preview.latest());
        assertEquals(preview.chartData().getLast(), preview.latest());
    }

    @Test
    void incompatibleAndCensoredMeasurementsStaySeparateAndPreserveNullChartValue() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result());
        var changed = measurement(own, first, "2026-10-11T07:00:00Z", "2", "NORMAL", true, "OTHER_KIND", "OTHER_CONTAINER", "<");
        jdbc.update("UPDATE result_values SET unit_snapshot='other-unit',method_snapshot='other-method' WHERE result_id=? AND numeric_value IS NOT NULL", changed.result().id());
        publish(changed.result());
        var preview = read().healthTrendPreview();
        assertEquals(1, preview.series().measurementCount());
        assertEquals("other-unit", preview.series().unit());
        assertEquals("other-method", preview.series().method());
        assertEquals("<", preview.latest().numericComparator());
        assertNull(preview.latest().chartValue());
        assertEquals(trend(preview.series().seriesId(), "period", "ALL").latest(), preview.latest());
    }

    @Test
    void sameTimeSeriesSelectionUsesStableSeriesIdTie() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result());
        publish(measurement(own, free, "2026-10-10T07:00:00Z", "2", "NORMAL", true).result());
        var response = mvc.perform(bearer(get("/api/results/me/trends/biomarkers"), Role.PATIENT)).andReturn().getResponse();
        var nodes = json.readTree(response.getContentAsByteArray()).get("content");
        var ids = new ArrayList<String>();
        nodes.forEach(n -> ids.add(n.get("seriesId").asString()));
        ids.sort(String::compareTo);
        assertEquals(ids.getFirst(), read().healthTrendPreview().series().seriesId());
    }

    @Test
    void browseReviewCreateRetryBookAndReadPatientActionsFeedDashboard() throws Exception {
        mvc.perform(bearer(get("/api/lab-tests").param("search", "Synthetic"), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2));
        var chosen = read().catalogSuggestions().getFirst();
        mvc.perform(bearer(get("/api/lab-tests/" + chosen.id()), Role.PATIENT)).andExpect(status().isOk());
        String key = UUID.randomUUID().toString();
        String body = json.writeValueAsString(Map.of("testIds", List.of(chosen.id())));
        var created = mvc.perform(bearer(post("/api/orders/me"), Role.PATIENT).contentType("application/json")
                .header("Idempotency-Key", key).content(body)).andExpect(status().isCreated()).andReturn().getResponse();
        String orderId = json.readTree(created.getContentAsByteArray()).get("id").asString();
        mvc.perform(bearer(post("/api/orders/me"), Role.PATIENT).contentType("application/json")
                .header("Idempotency-Key", key).content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(orderId));
        var type = schedule.saveType(actor(Role.ADMIN), null, new com.smartlims.appointments.dto.AppointmentRequests.Type("SYN_DASH", "Synthetic dashboard visit", true));
        var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).plusSeconds(86400);
        var slot = schedule.createSlot(actor(Role.RECEPTIONIST), new com.smartlims.appointments.dto.AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(1800).toString(), 2, true));
        mvc.perform(bearer(get("/api/appointment-types"), Role.PATIENT)).andExpect(jsonPath("$.content[0].id").value(type.id().toString()));
        mvc.perform(bearer(get("/api/appointment-slots").param("orderId", orderId).param("typeId", type.id().toString())
                        .param("from", start.minusSeconds(1).toString()).param("to", start.plusSeconds(3600).toString()), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(slot.id().toString()));
        String bookingKey = UUID.randomUUID().toString();
        String booking = json.writeValueAsString(Map.of("orderId", orderId, "typeId", type.id(), "slotId", slot.id()));
        mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).contentType("application/json")
                .header("Idempotency-Key", bookingKey).content(booking)).andExpect(status().isCreated());
        mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).contentType("application/json")
                .header("Idempotency-Key", bookingKey).content(booking)).andExpect(status().isOk());
        var result = read();
        assertEquals(1, result.totalOrders());
        assertEquals(1, result.upcomingAppointmentCount());
        assertEquals(orderId, result.nextAppointment().orderId().toString());
        mvc.perform(get("/api/orders/me/" + orderId).header("Authorization", "Bearer " + strangerToken)).andExpect(status().isNotFound());
        mvc.perform(get("/api/appointments/me/" + result.nextAppointment().id()).header("Authorization", "Bearer " + strangerToken)).andExpect(status().isNotFound());
    }

    @Test
    void concurrentCorrectionReadsKeepCountsCardsAndTrendInOneSnapshot() throws Exception {
        var f = measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true);
        var original = publish(f.result());
        var working = publicationService.correct(actor(Role.LAB_TECHNICIAN), original.id().toString(), new ResultRequests.Correction("Synthetic concurrent correction"), keys()).result();
        var edited = fill(working, List.of(f.sample().id()), "2026-10-10T07:00:00Z", "2", "HIGH", null);
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), edited.id().toString(), new ResultRequests.Revision(edited.version()));
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var gate = new java.util.concurrent.CountDownLatch(1);
            var write = pool.submit(() -> {
                gate.await();
                return publicationService.publish(actor(reviewerId, Role.ADMIN), approved.id().toString(), new ResultRequests.Revision(approved.version()));
            });
            var reads = pool.submit(() -> {
                gate.await();
                for (int i = 0; i < 5; i++) {
                    var result = dashboard.getMe(actor(Role.PATIENT));
                    assertEquals(1, result.currentPublishedResultCount());
                    assertEquals(1, result.latestResults().size());
                    var id = result.latestResults().getFirst().resultId();
                    assertTrue(Set.of(original.id(), approved.id()).contains(id));
                    assertEquals(id, result.healthTrendPreview().latest().resultId());
                }
                return true;
            });
            gate.countDown();
            write.get(20, java.util.concurrent.TimeUnit.SECONDS);
            assertTrue(reads.get(20, java.util.concurrent.TimeUnit.SECONDS));
        }
        assertEquals(approved.id(), read().latestResults().getFirst().resultId());
    }
}
