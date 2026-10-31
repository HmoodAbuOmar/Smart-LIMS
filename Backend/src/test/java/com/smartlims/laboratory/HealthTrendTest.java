package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.results.dto.*;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class HealthTrendTest extends MedicalHistoryTestSupport {
    private static final String BIOMARKERS = "/api/results/me/trends/biomarkers";
    private static final String TREND = "/api/results/me/trends";

    @Test
    void pointsUseMeasurementChronologyAndStatsAreIndependentOfTablePage() throws Exception {
        // Deliberately publish out of measurement order.
        var last = measurement(own, first, "2026-10-24T07:00:00Z", "11", "LOW", true);
        var latest = publish(last.result());
        publish(measurement(own, first, "2026-05-20T07:00:00Z", "12.8", "NORMAL", true).result());
        publish(measurement(own, first, "2026-10-12T07:00:00Z", "11.2", "LOW", true).result());
        publish(measurement(own, first, "2026-08-18T07:00:00Z", "12.4", "NORMAL", true).result());
        var result = trend(seriesId(), "period", "ALL", "page", "1", "size", "1");
        assertEquals(4, result.measurementCount());
        assertEquals(latest.id(), result.latest().resultId());
        assertEquals(0, result.previous().numericValue().compareTo(new BigDecimal("11.2")));
        assertEquals(0, result.absoluteChange().compareTo(new BigDecimal("-0.2")));
        assertEquals(new BigDecimal("-1.785714"), result.percentageChange());
        assertEquals(4, result.chartData().size());
        assertEquals(4, result.measurements().totalElements());
        assertEquals(1, result.measurements().content().size());
        assertEquals(result.previous(), result.measurements().content().getFirst());
        assertEquals(Instant.parse("2026-05-20T07:00:00Z"), result.chartData().getFirst().measuredAt());
        assertEquals("Retained note", result.latest().notes());
        assertEquals("Retained explanation", result.latest().explanation());
        assertEquals("Supplied synthetic reference", result.latest().referenceText());
        assertEquals("LOW", result.latest().flag().name());
        assertEquals("Asia/Jerusalem", result.timeZone());
        assertEquals(last.visit().id(), result.latest().visits().getFirst().id());
    }

    @Test
    void draftApprovalForeignAndUnreportedNumericValuesNeverEnterSeries() throws Exception {
        var draft = measurement(own, first, "2026-10-10T07:00:00Z", "4", "HIGH", true);
        mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), draft.result().id().toString(), new ResultRequests.Revision(draft.result().version()));
        mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        publicationService.publish(actor(reviewerId, Role.ADMIN), approved.id().toString(), new ResultRequests.Revision(approved.version()));
        publish(measurement(other, first, "2026-10-11T07:00:00Z", "999", "HIGH", true).result());
        var empty = measurement(own, first, "2026-10-12T07:00:00Z", "1", "NORMAL", true);
        // Synthetic optional numeric definition snapshot: an empty numeric row is unreported.
        jdbc.update("UPDATE result_values SET is_required_snapshot=false WHERE result_id=? AND numeric_value IS NOT NULL", empty.result().id());
        var optional = draftService.get(actor(Role.LAB_TECHNICIAN), empty.result().id().toString());
        publish(fill(optional, List.of(empty.sample().id()), "2026-10-12T07:00:00Z", null, "NORMAL", null));
        mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].measurementCount").value(1));
        assertEquals(1, trend(seriesId(), "period", "ALL").measurementCount());
    }

    @Test
    void zeroSingleEmptyAndDistantPagesAreSafe() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "0", "NOT_EVALUATED", true).result());
        String id = seriesId();
        var single = trend(id, "period", "ALL");
        assertNull(single.previous());
        assertNull(single.absoluteChange());
        assertNull(single.percentageChange());
        assertEquals(0, single.latest().numericValue().signum());
        publish(measurement(own, first, "2026-10-11T07:00:00Z", "2.5", "NOT_EVALUATED", true).result());
        var zeroPrevious = trend(id, "period", "ALL", "page", "2147483647", "size", "100");
        assertEquals(0, zeroPrevious.absoluteChange().compareTo(new BigDecimal("2.5")));
        assertNull(zeroPrevious.percentageChange());
        assertEquals(2, zeroPrevious.measurements().totalElements());
        assertTrue(zeroPrevious.measurements().content().isEmpty());
        var empty = trend(id, "period", "CUSTOM", "fromDate", "2026-01-01", "toDate", "2026-01-01");
        assertEquals(0, empty.measurementCount());
        assertNull(empty.latest());
        assertNull(empty.previous());
        assertNull(empty.absoluteChange());
        assertNull(empty.percentageChange());
        assertTrue(empty.chartData().isEmpty());
        assertTrue(empty.measurements().last());
    }

    @Test
    void positiveNegativeAndUnchangedNumbersUseSignedDecimalArithmetic() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "-2", "NOT_EVALUATED", true).result());
        publish(measurement(own, first, "2026-10-11T07:00:00Z", "-1", "NOT_EVALUATED", true).result());
        var negative = trend(seriesId(), "period", "ALL");
        assertEquals(0, negative.absoluteChange().compareTo(BigDecimal.ONE));
        assertEquals(new BigDecimal("-50.000000"), negative.percentageChange());
        publish(measurement(own, first, "2026-10-12T07:00:00Z", "-1", "NOT_EVALUATED", true).result());
        var same = trend(seriesId(), "period", "ALL");
        assertEquals(0, same.absoluteChange().signum());
        assertEquals(0, same.percentageChange().signum());
    }

    @Test
    void censoredNumericValuesRetainComparatorButHaveNoExactChartOrDifferences() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "2", "NOT_EVALUATED", true).result());
        publish(measurement(own, first, "2026-10-11T07:00:00Z", "3", "NOT_EVALUATED", true, "SYNTHETIC", null, "<").result());
        var censored = trend(seriesId(), "period", "ALL");
        assertEquals("<", censored.latest().numericComparator());
        assertNull(censored.latest().chartValue());
        assertNull(censored.absoluteChange());
        assertNull(censored.percentageChange());
        assertNotNull(censored.previous().chartValue());
        publish(measurement(own, first, "2026-10-12T07:00:00Z", "2", "NOT_EVALUATED", true).result());
        assertNull(trend(seriesId(), "period", "ALL").absoluteChange());
    }

    @Test
    void correctionsReplaceOnePointAndDoNotChangeMeasuredChronology() throws Exception {
        var f = measurement(own, first, "2026-10-10T07:00:00Z", "2", "HIGH", true);
        var original = publish(f.result());
        String id = seriesId();
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), original.id().toString(), new ResultRequests.Correction("Synthetic correction"), keys()).result();
        assertEquals(original.id(), trend(id, "period", "ALL").latest().resultId());
        var next = publish(fill(correction, List.of(f.sample().id()), "2026-10-10T07:00:00Z", "1", "NORMAL", null));
        var corrected = trend(id, "period", "ALL");
        assertEquals(1, corrected.measurementCount());
        assertEquals(next.id(), corrected.latest().resultId());
        assertEquals(original.measuredAt(), corrected.latest().measuredAt());
        assertEquals(0, corrected.latest().numericValue().compareTo(BigDecimal.ONE));
        state(f.order().id(), "CANCELLED");
        assertEquals(1, trend(id, "period", "ALL").measurementCount());
        mvc.perform(bearer(get("/api/results/me/" + original.id()), Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.superseded").value(true));
    }

    @Test
    void incompatibleUnitsMethodsSpecimensContainersAndParameterIdentitiesStaySeparate() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result());
        var unit = measurement(own, first, "2026-10-11T07:00:00Z", "2", "NORMAL", true);
        // Valid synthetic historical snapshots, changed only before immutable publication.
        jdbc.update("UPDATE result_values SET unit_snapshot='other-unit' WHERE result_id=? AND numeric_value IS NOT NULL", unit.result().id());
        publish(unit.result());
        var method = measurement(own, first, "2026-10-12T07:00:00Z", "3", "NORMAL", true);
        jdbc.update("UPDATE result_values SET method_snapshot='other-method' WHERE result_id=? AND numeric_value IS NOT NULL", method.result().id());
        publish(method.result());
        publish(measurement(own, first, "2026-10-13T07:00:00Z", "4", "NORMAL", true, "OTHER_SPECIMEN", null, null).result());
        publish(measurement(own, first, "2026-10-14T07:00:00Z", "5", "NORMAL", true, "SYNTHETIC", "OTHER_CONTAINER", null).result());
        publish(measurement(own, free, "2026-10-15T07:00:00Z", "6", "NORMAL", true).result());
        mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(6));
        // Deactivation and current catalog labels cannot rewrite retained identity.
        jdbc.update("UPDATE test_parameters SET active=false WHERE lab_test_id=?", first.getId());
        jdbc.update("UPDATE lab_tests SET name='Changed catalog label' WHERE id=?", first.getId());
        mvc.perform(bearer(get(BIOMARKERS).param("search", "first"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(5));
    }

    @Test
    void multipleSameKindSpecimensAndMultiKindSignaturesDoNotDuplicatePoints() throws Exception {
        var a = measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", false);
        var extra = specimen(a.visit(), a.result().orderItemId(), "2026-10-10T07:00:00Z", "SYNTHETIC", null);
        publish(fill(a.result(), List.of(a.sample().id(), extra.id()), "2026-10-10T07:00:00Z", "1", "NORMAL", null));
        publish(measurement(own, first, "2026-10-11T07:00:00Z", "2", "NORMAL", true).result());
        mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].measurementCount").value(2));
        assertEquals(1, trend(seriesId(), "period", "ALL").chartData().getFirst().visits().size());
        var b = measurement(own, first, "2026-10-12T07:00:00Z", "3", "NORMAL", false);
        var otherKind = specimen(b.visit(), b.result().orderItemId(), "2026-10-12T07:00:00Z", "OTHER_KIND", null);
        publish(fill(b.result(), List.of(otherKind.id(), b.sample().id()), "2026-10-12T07:00:00Z", "3", "NORMAL", null));
        mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void jerusalemMeasurementDateBoundariesUseDstAndIgnorePublicationDate() throws Exception {
        publish(measurement(own, first, "2026-10-24T20:59:59Z", "1", "NORMAL", true).result()); // Oct24 23:59:59
        publish(measurement(own, first, "2026-10-24T21:00:00Z", "2", "NORMAL", true).result()); // Oct25 00:00 +03
        publish(measurement(own, first, "2026-10-25T21:59:59Z", "3", "NORMAL", true).result()); // Oct25 23:59:59 +02
        publish(measurement(own, first, "2026-10-25T22:00:00Z", "4", "NORMAL", true).result()); // Oct26 00:00 +02
        var selected = trend(seriesId(), "period", "CUSTOM", "fromDate", "2026-10-25", "toDate", "2026-10-25");
        assertEquals(2, selected.measurementCount());
        assertEquals(LocalDate.of(2026, 10, 25), selected.latest().measurementDate());
        assertEquals(0, selected.absoluteChange().compareTo(BigDecimal.ONE));
    }

    @Test
    void rollingCalendarWindowsAndDefaultPeriodAreExplicit() throws Exception {
        var today = LocalDate.of(2026, 10, 30);
        var expected = Map.of("1M", today.minusMonths(1), "3M", today.minusMonths(3), "6M", today.minusMonths(6), "1Y", today.minusYears(1));
        for (var entry : expected.entrySet()) {
            var dates = HistoryDates.trends(LaboratoryQuery.of(Map.of("period", List.of(entry.getKey())), "period"), today);
            assertEquals(entry.getValue(), dates.fromDate());
            assertEquals(today, dates.toDate());
        }
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result());
        assertEquals(LocalDate.now(HistoryDates.ZONE).minusMonths(6), trend(seriesId()).fromDate());
        assertNull(trend(seriesId(), "period", "ALL").fromDate());
    }

    @Test
    void equalMeasurementInstantsUseStableItemAndValueUuidTies() throws Exception {
        var a = publish(measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result());
        var b = publish(measurement(own, first, "2026-10-10T07:00:00Z", "2", "NORMAL", true).result());
        var expected = List.of(a.orderItemId().toString(), b.orderItemId().toString()).stream().sorted().toList();
        var result = trend(seriesId(), "period", "ALL");
        assertEquals(expected, result.chartData().stream().map(m -> m.orderItemId().toString()).toList());
        assertEquals(expected.getLast(), result.latest().orderItemId().toString());
    }

    @Test
    void discoveryLiteralSearchPaginationAndEmptyMetadata() throws Exception {
        mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0)).andExpect(jsonPath("$.last").value(true));
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result());
        publish(measurement(own, free, "2026-10-10T07:00:00Z", "2", "NORMAL", true).result());
        mvc.perform(bearer(get(BIOMARKERS).param("search", "  SyNtHeTiC NuMeRiC  ").param("size", "1"), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.content.length()").value(1));
        mvc.perform(bearer(get(BIOMARKERS).param("search", "%"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get(BIOMARKERS).param("page", "2147483647").param("size", "100"), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content").isEmpty());
        String firstPage = seriesId();
        var next = mvc.perform(bearer(get(BIOMARKERS).param("page", "1").param("size", "1"), Role.PATIENT)).andReturn().getResponse();
        String secondPage = json.readTree(next.getContentAsByteArray()).get("content").get(0).get("seriesId").asString();
        assertTrue(firstPage.compareTo(secondPage) < 0);
    }

    @Test
    void ownershipUnknownSeriesRolesCookiesAndUnlinkedProfileAreEnforced() throws Exception {
        publish(measurement(other, first, "2026-10-10T07:00:00Z", "999", "HIGH", true).result());
        var foreignResponse = mvc.perform(get(BIOMARKERS).header("Authorization", "Bearer " + strangerToken)).andReturn().getResponse();
        String foreignKey = json.readTree(foreignResponse.getContentAsByteArray()).get("content").get(0).get("seriesId").asString();
        for (String id : List.of(foreignKey, "0".repeat(64)))
            error(mvc.perform(bearer(get(TREND).param("seriesId", id), Role.PATIENT)), 404, "TREND_SERIES_NOT_FOUND", null);
        mvc.perform(get(BIOMARKERS)).andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            mvc.perform(bearer(get(BIOMARKERS), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(get(TREND).param("seriesId", foreignKey), role)).andExpect(status().isForbidden());
        }
        mvc.perform(get(BIOMARKERS).cookie(new jakarta.servlet.http.Cookie("access_token", tokens.get(Role.PATIENT))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        jdbc.update("UPDATE patients SET user_id=null WHERE id=?", own.getId());
        error(mvc.perform(bearer(get(BIOMARKERS), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        error(mvc.perform(bearer(get(TREND).param("seriesId", foreignKey), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
    }

    @Test
    void strictTrendAndDiscoveryQueriesRejectMalformedSelectors() throws Exception {
        String[][] invalid = {{"seriesId", "bad"}, {"period", "6m"}, {"period", ""}, {"page", "-1"}, {"size", "101"}, {"patientId", other.getId().toString()}, {"fromDate", "2026-10-01"}};
        for (var pair : invalid)
            error(mvc.perform(bearer(get(TREND).param("seriesId", "0".repeat(64)).param(pair[0], pair[1]), Role.PATIENT)), 400, "VALIDATION_ERROR", pair[0]);
        for (String field : List.of("seriesId", "period", "fromDate", "toDate", "page", "size"))
            error(mvc.perform(bearer(get(TREND).param(field, "x", "y"), Role.PATIENT)), 400, "VALIDATION_ERROR", field);
        error(mvc.perform(bearer(get(TREND), Role.PATIENT)), 400, "VALIDATION_ERROR", "seriesId");
        error(mvc.perform(bearer(get(TREND).param("seriesId", "0".repeat(64)).param("period", "CUSTOM"), Role.PATIENT)), 400, "VALIDATION_ERROR", "fromDate");
        error(mvc.perform(bearer(get(TREND).param("seriesId", "0".repeat(64)).param("period", "CUSTOM").param("fromDate", "2026-01-01"), Role.PATIENT)), 400, "VALIDATION_ERROR", "toDate");
        error(mvc.perform(bearer(get(TREND).param("seriesId", "0".repeat(64)).param("period", "CUSTOM").param("fromDate", "2026-10-10").param("toDate", "2026-02-30"), Role.PATIENT)), 400, "VALIDATION_ERROR", "toDate");
        error(mvc.perform(bearer(get(BIOMARKERS).param("search", "x".repeat(151)), Role.PATIENT)), 400, "VALIDATION_ERROR", "search");
        error(mvc.perform(bearer(get(BIOMARKERS).param("search", "x", "y"), Role.PATIENT)), 400, "VALIDATION_ERROR", "search");
        error(mvc.perform(bearer(get(BIOMARKERS).param("testId", first.getId().toString()), Role.PATIENT)), 400, "VALIDATION_ERROR", "testId");
    }

    @Test
    void fullPrecisionStorageDecimalsDoNotOverflowArithmetic() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "0.000000000001", "NOT_EVALUATED", true).result());
        publish(measurement(own, first, "2026-10-11T07:00:00Z", "99999999999999999999999999.999999999999", "NOT_EVALUATED", true).result());
        var result = trend(seriesId(), "period", "ALL");
        assertEquals(0, result.absoluteChange().compareTo(new BigDecimal("99999999999999999999999999.999999999998")));
        assertEquals(0, result.percentageChange().compareTo(new BigDecimal("9999999999999999999999999999999999999800")));
    }

    @Test
    void correctionPublicationConcurrentWithTrendReadsNeverDuplicatesOrHidesCurrentPoint() throws Exception {
        var f = measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true);
        var original = publish(f.result());
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), original.id().toString(), new ResultRequests.Correction("Synthetic concurrent correction"), keys()).result();
        var edited = fill(correction, List.of(f.sample().id()), "2026-10-10T07:00:00Z", "2", "HIGH", null);
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), edited.id().toString(), new ResultRequests.Revision(edited.version()));
        String id = seriesId();
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var gate = new java.util.concurrent.CountDownLatch(1);
            var write = pool.submit(() -> {
                gate.await();
                return publicationService.publish(actor(reviewerId, Role.ADMIN), approved.id().toString(), new ResultRequests.Revision(approved.version()));
            });
            var read = pool.submit(() -> {
                gate.await();
                for (int i = 0; i < 5; i++) {
                    var current = trend(id, "period", "ALL");
                    assertEquals(1, current.measurementCount());
                    assertEquals(1, current.chartData().size());
                    assertTrue(Set.of(original.id(), approved.id()).contains(current.latest().resultId()));
                    mvc.perform(bearer(get("/api/visits/me/archive"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1))
                            .andExpect(jsonPath("$.content[0].tests.length()").value(1));
                }
                return true;
            });
            gate.countDown();
            write.get(20, java.util.concurrent.TimeUnit.SECONDS);
            assertTrue(read.get(20, java.util.concurrent.TimeUnit.SECONDS));
        }
        assertEquals(approved.id(), trend(id, "period", "ALL").latest().resultId());
    }
}
