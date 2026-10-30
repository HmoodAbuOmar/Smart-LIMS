package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.results.dto.ResultRequests;
import com.smartlims.visits.dto.VisitRequests;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class VisitArchiveTest extends MedicalHistoryTestSupport {
    private static final String ARCHIVE = "/api/visits/me/archive";

    @Test void archiveRequiresCompletedVisitAndActualPublishedSpecimenEvidence() throws Exception {
        var visible = measurement(own, first, "2026-10-10T10:00:00Z", "2", "HIGH", true); publish(visible.result());
        var open = measurement(own, first, "2026-10-11T10:00:00Z", "3", "LOW", false); publish(open.result());
        var draft = measurement(own, first, "2026-10-12T10:00:00Z", "4", "NORMAL", true);
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), draft.result().id().toString(), new ResultRequests.Revision(draft.result().version()));
        var foreign = measurement(other, first, "2026-10-13T10:00:00Z", "5", "HIGH", true); publish(foreign.result());
        mvc.perform(bearer(get(ARCHIVE), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].id").value(visible.visit().id().toString()))
                .andExpect(jsonPath("$.content[0].resultFlags[0]").value("HIGH"))
                .andExpect(jsonPath("$.content[0].paymentStatus").doesNotExist()).andExpect(jsonPath("$.content[0].amountPaid").doesNotExist());
        error(mvc.perform(bearer(get(ARCHIVE + "/" + open.visit().id()), Role.PATIENT)), 404, "VISIT_NOT_FOUND", null);
        error(mvc.perform(bearer(get(ARCHIVE + "/" + approved.visitIds().getFirst()), Role.PATIENT)), 404, "VISIT_NOT_FOUND", null);
        // A second completed visit selecting the same item has no specimen evidence for that result.
        var extra = visitService.arrive(actor(Role.RECEPTIONIST), new VisitRequests.Arrival(open.order().id().toString(), null,
                open.order().items().stream().map(i -> i.id().toString()).toList(), "2026-10-11T12:00:00Z"), keys()).visit(); close(extra);
        mvc.perform(bearer(get(ARCHIVE), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1));
        error(mvc.perform(bearer(get(ARCHIVE + "/" + extra.id()), Role.PATIENT)), 404, "VISIT_NOT_FOUND", null);
    }

    @Test void literalSearchAndCombinedTestFlagDateFiltersUseUniqueVisits() throws Exception {
        var a = measurement(own, first, "2026-10-10T10:00:00Z", "2", "HIGH", true); publish(a.result());
        var b = measurement(own, free, "2026-10-12T10:00:00Z", "3", "LOW", true); publish(b.result());
        for (String search : List.of("  FIRST  ", first.getCode(), a.visit().visitNumber(), a.order().orderNumber())) {
            mvc.perform(bearer(get(ARCHIVE).param("search", search), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].id").value(a.visit().id().toString()));
        }
        for (String literal : List.of("%", "_", "\\")) {
            // Codes contain underscores, so only % and backslash are absent from the fixtures.
            mvc.perform(bearer(get(ARCHIVE).param("search", literal), Role.PATIENT))
                    .andExpect(jsonPath("$.totalElements").value(literal.equals("_") ? 2 : 0));
        }
        mvc.perform(bearer(get(ARCHIVE).param("testId", first.getId().toString()).param("resultStatus", "LOW"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get(ARCHIVE).param("testId", first.getId().toString()).param("resultStatus", "HIGH")
                .param("fromDate", "2026-10-10").param("toDate", "2026-10-10"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(bearer(get(ARCHIVE).param("testId", UUID.randomUUID().toString()), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test void multipleSpecimensNeverDuplicateVisitCountsAndDetailsReusePublishedSnapshots() throws Exception {
        var f = measurement(own, first, "2026-10-10T10:00:00Z", "2", "LOW", false);
        var second = specimen(f.visit(), f.result().orderItemId(), "2026-10-10T10:00:00Z", "SYNTHETIC", null);
        var r = publish(fill(f.result(), List.of(f.sample().id(), second.id()), "2026-10-10T10:00:00Z", "2", "LOW", null)); close(f.visit());
        mvc.perform(bearer(get(ARCHIVE).param("size", "1"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].tests.length()").value(1));
        var response = mvc.perform(bearer(get(ARCHIVE + "/" + f.visit().id()), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.results[0].id").value(r.id().toString()))
                .andExpect(jsonPath("$.results[0].events").isEmpty()).andExpect(jsonPath("$.results[0].explanation").value("Retained explanation"))
                .andExpect(jsonPath("$.visit.tests[0].reportUrl").value("/api/results/me/" + r.id() + "/report"))
                .andReturn().getResponse();
        assertFalse(response.getContentAsString().contains("requestHash"));
        mvc.perform(bearer(get("/api/visits/me/" + f.visit().id()), Role.PATIENT)).andExpect(status().isOk());
        mvc.perform(bearer(get("/api/results/me/" + r.id()), Role.PATIENT)).andExpect(status().isOk());
    }

    @Test void correctionDraftKeepsOldPublicationThenReplacementChangesFlagsWithoutDuplicate() throws Exception {
        var f = measurement(own, first, "2026-10-10T10:00:00Z", "2", "HIGH", true); var original = publish(f.result());
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), original.id().toString(), new ResultRequests.Correction("Synthetic correction"), keys()).result();
        mvc.perform(bearer(get(ARCHIVE), Role.PATIENT)).andExpect(jsonPath("$.content[0].tests[0].resultId").value(original.id().toString()));
        var next = publish(fill(correction, List.of(f.sample().id()), "2026-10-10T10:00:00Z", "1", "NORMAL", null));
        mvc.perform(bearer(get(ARCHIVE).param("resultStatus", "HIGH"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get(ARCHIVE), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].tests[0].resultId").value(next.id().toString()));
        state(f.order().id(), "CANCELLED");
        mvc.perform(bearer(get(ARCHIVE), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test void paginationTiesDistantAndEmptyPagesKeepAccurateTotals() throws Exception {
        var a = measurement(own, first, "2026-10-10T10:00:00Z", "2", "NORMAL", true); publish(a.result());
        var b = measurement(own, first, "2026-10-10T10:00:00Z", "3", "NORMAL", true); publish(b.result());
        var expected = List.of(a.visit().id().toString(), b.visit().id().toString()).stream().sorted().toList();
        for (int i = 0; i < 2; i++) mvc.perform(bearer(get(ARCHIVE).param("size", "1").param("page", "" + i), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.content[0].id").value(expected.get(i)));
        mvc.perform(bearer(get(ARCHIVE).param("size", "100").param("page", "2147483647"), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.last").value(true));
        mvc.perform(bearer(get(ARCHIVE).param("search", "absent"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0)).andExpect(jsonPath("$.last").value(true));
    }

    @Test void testAndFlagMustMatchSamePublishedTestAndFilteredRowRetainsOtherPublishedTests() throws Exception {
        define(first.getId()); define(free.getId());
        var order = create(own, first, free); var visit = arrive(order, null);
        for (var item : order.items()) {
            var sample = received(visit, item.id());
            var result = draftService.create(actor(Role.LAB_TECHNICIAN), new ResultRequests.Create(item.id().toString()), keys()).result();
            publish(fill(result, List.of(sample.id()), com.smartlims.laboratory.dto.LaboratoryInput.now().toString(), "1",
                    item.labTestId().equals(first.getId()) ? "HIGH" : "LOW", null));
        }
        close(visit);
        mvc.perform(bearer(get(ARCHIVE).param("testId", first.getId().toString()).param("resultStatus", "LOW"), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get(ARCHIVE).param("testId", first.getId().toString()).param("resultStatus", "HIGH"), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].tests.length()").value(2));
    }

    @Test void jerusalemArrivalDayUsesBothBoundariesAroundDst() throws Exception {
        var a = measurement(own, first, "2026-10-24T22:30:00Z", "2", "NORMAL", true); publish(a.result()); // arrival 00:30 +03
        var b = measurement(own, first, "2026-10-25T22:30:00Z", "3", "NORMAL", true); publish(b.result()); // arrival 23:30 +02
        var c = measurement(own, first, "2026-10-25T23:30:00Z", "4", "NORMAL", true); publish(c.result()); // arrival next day 00:30 +02
        mvc.perform(bearer(get(ARCHIVE).param("fromDate", "2026-10-25").param("toDate", "2026-10-25"), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content[0].visitDate").value("2026-10-25"));
    }

    @Test void ownershipRolesUnlinkedAndDetailQueriesAreEnforced() throws Exception {
        var f = measurement(other, first, "2026-10-10T10:00:00Z", "2", "NORMAL", true); publish(f.result());
        for (String id : List.of(f.visit().id().toString(), UUID.randomUUID().toString())) error(mvc.perform(bearer(get(ARCHIVE + "/" + id), Role.PATIENT)), 404, "VISIT_NOT_FOUND", null);
        mvc.perform(get(ARCHIVE)).andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            mvc.perform(bearer(get(ARCHIVE), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(get(ARCHIVE + "/" + f.visit().id()), role)).andExpect(status().isForbidden());
        }
        error(mvc.perform(bearer(get(ARCHIVE + "/" + f.visit().id()).param("page", "0"), Role.PATIENT)), 400, "VALIDATION_ERROR", "page");
        jdbc.update("UPDATE patients SET user_id=null WHERE id=?", own.getId());
        error(mvc.perform(bearer(get(ARCHIVE), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
    }

    @Test void strictArchiveSelectorsRejectInvalidAndRepeatedInputs() throws Exception {
        String[][] invalid = {{"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "2147483648"}, {"testId", "1-1-1-1-1"},
                {"fromDate", "2026-02-30"}, {"fromDate", "2026-1-1"}, {"toDate", ""}, {"resultStatus", "All"}, {"search", "x".repeat(151)}, {"patientId", other.getId().toString()}};
        for (var pair : invalid) error(mvc.perform(bearer(get(ARCHIVE).param(pair[0], pair[1]), Role.PATIENT)), 400, "VALIDATION_ERROR", pair[0]);
        for (String key : List.of("page", "size", "search", "fromDate", "toDate", "testId", "resultStatus"))
            error(mvc.perform(bearer(get(ARCHIVE).param(key, "a", "b"), Role.PATIENT)), 400, "VALIDATION_ERROR", key);
        error(mvc.perform(bearer(get(ARCHIVE).param("fromDate", "2026-10-12").param("toDate", "2026-10-10"), Role.PATIENT)), 400, "VALIDATION_ERROR", "toDate");
        error(mvc.perform(bearer(get(ARCHIVE + "/bad-id"), Role.PATIENT)), 400, "VALIDATION_ERROR", "id");
    }

    @Test void archiveTestChoicesIncludeInactiveHistoryDeduplicateAndEnforceOwnershipAndValidation() throws Exception {
        publish(measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result());
        publish(measurement(own, first, "2026-10-11T07:00:00Z", "2", "NORMAL", true).result());
        publish(measurement(other, free, "2026-10-12T07:00:00Z", "3", "NORMAL", true).result());
        jdbc.update("UPDATE lab_tests SET active=false,name='Changed catalog name' WHERE id=?", first.getId());
        mvc.perform(bearer(get(ARCHIVE + "/tests").param("search", "first").param("size", "1"), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].labTestId").value(first.getId().toString()))
                .andExpect(jsonPath("$.content[0].testName").value("Synthetic first test"));
        mvc.perform(bearer(get(ARCHIVE + "/tests").param("search", "%"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get(ARCHIVE + "/tests").param("page", "2147483647").param("size", "100"), Role.PATIENT))
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content").isEmpty());
        error(mvc.perform(bearer(get(ARCHIVE + "/tests").param("patientId", other.getId().toString()), Role.PATIENT)), 400, "VALIDATION_ERROR", "patientId");
        error(mvc.perform(bearer(get(ARCHIVE + "/tests").param("search", "a", "b"), Role.PATIENT)), 400, "VALIDATION_ERROR", "search");
        mvc.perform(bearer(get(ARCHIVE + "/tests"), Role.ADMIN)).andExpect(status().isForbidden());
    }
}
