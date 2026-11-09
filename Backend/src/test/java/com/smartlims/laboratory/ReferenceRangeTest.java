package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.service.ReferenceRangeService;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.results.dto.ResultRequests;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ReferenceRangeTest extends LaboratoryTestSupport {
    @Autowired
    ReferenceRangeService ranges;

    private TestParameterResponse parameter(String type) {
        return parameterService.save(actor(Role.ADMIN), first.getId().toString(), null,
                new TestParameterRequest("SYN_" + type, "Synthetic parameter", type, null, null, 0, false, true, null));
    }

    private String path(UUID test, UUID parameter) {
        return "/api/lab-tests/" + test + "/parameters/" + parameter + "/reference-ranges";
    }

    private ReferenceRangeRequest body(String applicability, Integer min, Integer max, String from, String to) {
        return new ReferenceRangeRequest(applicability, min, max, BigDecimal.ONE, BigDecimal.TEN, from, to);
    }

    private ReferenceRangeResponse add(UUID parameter, ReferenceRangeRequest body) {
        return ranges.create(actor(Role.ADMIN), first.getId().toString(), parameter.toString(), body);
    }

    @Test
    void adminCanCreateAndListInactiveNumericConfigurationWithStrictDtoAndNoSideEffects() throws Exception {
        var p = parameter("NUMERIC");
        jdbc.update("UPDATE test_parameters SET active=false WHERE id=?", p.id());
        jdbc.update("UPDATE lab_tests SET active=false WHERE id=?", first.getId());
        String path = path(first.getId(), p.id());
        mvc.perform(bearer(get(path), Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0)).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(post(path), Role.ADMIN).contentType("application/json")
                        .content("{\"applicability\":\"ANY\",\"minAgeDays\":\" \",\"upperLimit\":-1.25,\"validFrom\":\"\"}"))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.labTestId").value(first.getId().toString()))
                .andExpect(jsonPath("$.parameterId").value(p.id().toString()))
                .andExpect(jsonPath("$.applicability").value("ANY"))
                .andExpect(jsonPath("$.upperLimit").value(-1.25))
                .andExpect(jsonPath("$.createdAt").isString()).andExpect(jsonPath("$.classificationDate").isString())
                .andExpect(jsonPath("$.status").value("CURRENT"));
        var tree = json.readTree(mvc.perform(bearer(get(path), Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1)).andReturn().getResponse().getContentAsString()).get("content").get(0);
        assertEquals(13, tree.size());
        for (String field : List.of("minAgeDays", "maxAgeDays", "lowerLimit", "validFrom", "validTo"))
            assertTrue(tree.get(field).isNull(), field);
        for (String table : List.of("test_results", "result_values", "laboratory_events", "patient_notifications"))
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class));
        error(mvc.perform(bearer(put(path), Role.ADMIN).contentType("application/json").content("{}")), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(delete(path), Role.ADMIN)), 403, "FORBIDDEN", null);
    }

    @Test
    void enforcesAdminAndCurrentStoredEligibilityAtHttpAndServiceBoundaries() throws Exception {
        var p = parameter("NUMERIC");
        String path = path(first.getId(), p.id());
        var request = body("ANY", null, null, null, null);
        error(mvc.perform(get(path)), 401, "UNAUTHORIZED", null);
        error(mvc.perform(post(path).cookie(new jakarta.servlet.http.Cookie("access_token", tokens.get(Role.ADMIN)))
                .contentType("application/json").content(json.writeValueAsString(request))), 403, "FORBIDDEN", null);
        for (Role role : List.of(Role.PATIENT, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            error(mvc.perform(bearer(get(path), role)), 403, "FORBIDDEN", null);
            error(mvc.perform(bearer(post(path), role).contentType("application/json").content(json.writeValueAsString(request))), 403, "FORBIDDEN", null);
            assertEquals("FORBIDDEN", assertThrows(LaboratoryException.class, () -> ranges.create(actor(role), first.getId().toString(), p.id().toString(), request)).getCode());
            assertEquals("FORBIDDEN", assertThrows(LaboratoryException.class, () -> ranges.list(actor(role), first.getId().toString(), p.id().toString(), LaboratoryQuery.of(Map.of()))).getCode());
        }
        var staleAdmin = actor(Role.ADMIN);
        jdbc.update("UPDATE users SET role='RECEPTIONIST' WHERE id=?", actors.get(Role.ADMIN).getId());
        assertEquals("FORBIDDEN", assertThrows(LaboratoryException.class, () -> ranges.create(staleAdmin, first.getId().toString(), p.id().toString(), request)).getCode());
        jdbc.update("UPDATE users SET role='ADMIN',enabled=false WHERE id=?", actors.get(Role.ADMIN).getId());
        assertEquals("UNAUTHORIZED", assertThrows(LaboratoryException.class, () -> ranges.list(staleAdmin, first.getId().toString(), p.id().toString(), LaboratoryQuery.of(Map.of()))).getCode());
        error(mvc.perform(bearer(get(path), Role.ADMIN)), 401, "UNAUTHORIZED", null);
    }

    @Test
    void verifiesNestedOwnershipMissingIdsNumericTypeAndInvalidRequests() throws Exception {
        var p = parameter("NUMERIC");
        var text = parameter("TEXT");
        String valid = "{\"applicability\":\"ANY\",\"lowerLimit\":0}";
        for (var method : List.of("GET", "POST")) {
            for (var entry : Map.of(path(free.getId(), p.id()), "PARAMETER_NOT_FOUND",
                    path(first.getId(), UUID.randomUUID()), "PARAMETER_NOT_FOUND",
                    path(UUID.randomUUID(), p.id()), "LAB_TEST_NOT_FOUND",
                    path(first.getId(), text.id()), "REFERENCE_RANGE_NUMERIC_REQUIRED").entrySet()) {
                var request = method.equals("GET") ? get(entry.getKey()) : post(entry.getKey()).contentType("application/json").content(valid);
                error(mvc.perform(bearer(request, Role.ADMIN)), entry.getValue().equals("REFERENCE_RANGE_NUMERIC_REQUIRED") ? 409 : 404, entry.getValue(), null);
            }
        }
        String path = path(first.getId(), p.id());
        for (String invalid : List.of("{\"applicability\":\"ANY\",\"lowerLimit\":\"1\"}",
                "{\"applicability\":\"ANY\",\"lowerLimit\":0,\"minAgeDays\":1.5}",
                "{\"applicability\":\"ANY\",\"lowerLimit\":0,\"id\":\"forged\"}"))
            error(mvc.perform(bearer(post(path), Role.ADMIN).contentType("application/json").content(invalid)), 400, "INVALID_JSON", null);
        error(mvc.perform(bearer(post(path), Role.ADMIN).contentType("application/json").content("{\"applicability\":\"any\",\"lowerLimit\":0}")), 400, "VALIDATION_ERROR", "applicability");
        error(mvc.perform(bearer(get(path.replace(p.id().toString(), "bad")), Role.ADMIN)), 400, "VALIDATION_ERROR", "parameterId");
        error(mvc.perform(bearer(get(path.replace(first.getId().toString(), "bad")), Role.ADMIN)), 400, "VALIDATION_ERROR", "testId");
        for (var query : List.of(new String[]{"includeExpired", "TRUE"}, new String[]{"page", "-1"},
                new String[]{"size", "0"}, new String[]{"size", "101"}, new String[]{"sort", "id"}))
            error(mvc.perform(bearer(get(path).param(query[0], query[1]), Role.ADMIN)), 400, "VALIDATION_ERROR", query[0]);
        error(mvc.perform(bearer(get(path).param("includeExpired", "true", "true"), Role.ADMIN)), 400, "VALIDATION_ERROR", "includeExpired");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM reference_ranges", Integer.class));
    }

    @Test
    void overlapRequiresSameApplicabilityAndIntersectionInBothHalfOpenDimensions() {
        var p = parameter("NUMERIC");
        var original = body("MALE", 10, 20, "2030-01-10", "2030-01-20");
        add(p.id(), original);
        for (var conflict : List.of(original, body("MALE", null, null, null, null),
                body("MALE", 0, 11, "2030-01-01", "2030-01-11"),
                body("MALE", 19, null, "2030-01-19", null)))
            assertEquals("REFERENCE_RANGE_OVERLAP", assertThrows(LaboratoryException.class, () -> add(p.id(), conflict)).getCode());
        add(p.id(), body("MALE", 0, 10, "2030-01-10", "2030-01-20"));
        add(p.id(), body("MALE", 20, null, "2030-01-10", "2030-01-20"));
        add(p.id(), body("MALE", null, null, null, "2030-01-10"));
        add(p.id(), body("MALE", null, null, "2030-01-20", null));
        add(p.id(), body("FEMALE", null, null, null, null));
        add(p.id(), body("ANY", null, null, null, null));
        assertEquals(7, jdbc.queryForObject("SELECT count(*) FROM reference_ranges", Integer.class));
        assertEquals("REFERENCE_RANGE_OVERLAP", assertThrows(LaboratoryException.class,
                () -> add(p.id(), body("ANY", 1, 2, "1900-01-01", "1900-01-02"))).getCode());
        var other = parameterService.save(actor(Role.ADMIN), first.getId().toString(), null,
                new TestParameterRequest("OTHER_NUM", "Other synthetic numeric", "NUMERIC", null, null, 1, false, true, null));
        assertNotNull(add(other.id(), body("ANY", null, null, null, null)).id());
    }

    @Test
    void defaultListingIncludesCurrentAndFutureAndExpiredOptInKeepsStablePaging() throws Exception {
        var p = parameter("NUMERIC");
        var today = LocalDate.now(HistoryDates.ZONE);
        var expired = add(p.id(), body("ANY", null, null, null, today.toString()));
        var current = add(p.id(), body("ANY", null, null, today.toString(), today.plusDays(1).toString()));
        var future = add(p.id(), body("ANY", null, null, today.plusDays(1).toString(), null));
        assertEquals(ReferenceRangeResponse.Status.EXPIRED, expired.status());
        assertEquals(ReferenceRangeResponse.Status.CURRENT, current.status());
        assertEquals(ReferenceRangeResponse.Status.FUTURE, future.status());
        assertEquals(today, future.classificationDate());
        // Make timestamps tie deliberately; the UUID is the stable secondary key.
        jdbc.update("UPDATE reference_ranges SET created_at='2030-01-01T00:00:00Z'");
        String path = path(first.getId(), p.id());
        mvc.perform(bearer(get(path), Role.ADMIN)).andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(bearer(get(path).param("includeExpired", "false"), Role.ADMIN)).andExpect(jsonPath("$.totalElements").value(2));
        var ids = jdbc.queryForList("SELECT id::text FROM reference_ranges ORDER BY created_at,id", String.class);
        for (int i = 0; i < 3; i++)
            mvc.perform(bearer(get(path).param("includeExpired", "true").param("size", "1").param("page", Integer.toString(i)), Role.ADMIN))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3)).andExpect(jsonPath("$.totalPages").value(3))
                    .andExpect(jsonPath("$.content[0].id").value(ids.get(i))).andExpect(jsonPath("$.last").value(i == 2));
        mvc.perform(bearer(get(path).param("page", "2147483647").param("size", "100"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(0)).andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void concurrentCreatesSerializeEvenForAnInitiallyEmptyRangeSet() throws Exception {
        var p = parameter("NUMERIC");
        var request = body("ANY", null, null, null, null);
        var inserted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstCreate = executor.submit(() -> new TransactionTemplate(transactionManager).execute(tx -> {
                var response = add(p.id(), request);
                inserted.countDown();
                try {
                    assertTrue(release.await(10, TimeUnit.SECONDS));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(e);
                }
                return response;
            }));
            try {
                assertTrue(inserted.await(10, TimeUnit.SECONDS));
                var secondCreate = executor.submit(() -> {
                    secondStarted.countDown();
                    return assertThrows(LaboratoryException.class, () -> add(p.id(), request)).getCode();
                });
                assertTrue(secondStarted.await(10, TimeUnit.SECONDS));
                assertThrows(TimeoutException.class, () -> secondCreate.get(200, TimeUnit.MILLISECONDS));
                release.countDown();
                assertNotNull(firstCreate.get(10, TimeUnit.SECONDS));
                assertEquals("REFERENCE_RANGE_OVERLAP", secondCreate.get(10, TimeUnit.SECONDS));
            } finally {
                release.countDown();
            }
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM reference_ranges", Integer.class));
    }

    @Test
    void configuredNumericTypeIsRetainedAndScalarConstraintsAndForeignKeyAreEnforced() {
        var p = parameter("NUMERIC");
        var row = add(p.id(), body("ANY", null, null, null, null));
        var changed = new TestParameterRequest(p.code(), p.name(), "TEXT", null, null, 0, false, true, p.version());
        assertEquals("PARAMETER_HAS_REFERENCE_RANGES", assertThrows(LaboratoryException.class,
                () -> parameterService.save(actor(Role.ADMIN), first.getId().toString(), p.id().toString(), changed)).getCode());
        assertFalse(parameterService.save(actor(Role.ADMIN), first.getId().toString(), p.id().toString(),
                new TestParameterRequest(p.code(), p.name(), "NUMERIC", null, null, 0, false, false, p.version())).active());
        for (String change : List.of("applicability='UNKNOWN'", "min_age_days=-1", "min_age_days=1,max_age_days=1",
                "valid_from='2030-01-02',valid_to='2030-01-01'", "lower_limit=NULL,upper_limit=NULL",
                "lower_limit=11,upper_limit=10", "lower_limit='NaN'", "upper_limit='Infinity'"))
            assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("UPDATE reference_ranges SET " + change + " WHERE id=?", row.id()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("DELETE FROM test_parameters WHERE id=?", p.id()));
    }

    @Test
    void configurationNeverPopulatesManualDraftReferencesOrRewritesPublishedSnapshots() {
        var prepared = prepared(create(own, first));
        var draftNumeric = prepared.result().values().stream().filter(v -> v.resultType().name().equals("NUMERIC")).findFirst().orElseThrow();
        add(draftNumeric.parameterId(), body("FEMALE", null, null, null, null));
        assertEquals(prepared.result(), draftService.get(actor(Role.LAB_TECHNICIAN), prepared.result().id().toString()));
        var published = publish(prepared.result());
        var numeric = published.values().stream().filter(v -> v.resultType().name().equals("NUMERIC")).findFirst().orElseThrow();
        add(numeric.parameterId(), body("ANY", null, null, null, null));
        var retained = draftService.get(actor(Role.LAB_TECHNICIAN), published.id().toString());
        assertEquals(published, retained);
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), published.id().toString(),
                new ResultRequests.Correction("Synthetic correction"), List.of(UUID.randomUUID().toString())).result();
        assertEquals(published.values(), correction.values());
        var order = create(own, first);
        arrive(order, null);
        var draft = draftService.create(actor(Role.LAB_TECHNICIAN), new ResultRequests.Create(order.items().getFirst().id().toString()),
                List.of(UUID.randomUUID().toString())).result();
        for (var value : draft.values()) {
            assertNull(value.referenceMin());
            assertNull(value.referenceMax());
            assertNull(value.referenceText());
            assertEquals("NOT_EVALUATED", value.flag().name());
        }
    }
}
