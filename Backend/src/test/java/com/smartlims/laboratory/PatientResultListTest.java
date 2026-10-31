package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.results.dto.ResultRequests;

import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.*;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PatientResultListTest extends LaboratoryTestSupport {
    @Test
    void allAvailablePendingRowsReflectPublicationAndNeverCollapseRepeatedTests() throws Exception {
        var p = prepared(create(own, first));
        var published = publish(p.result());
        create(own, first);
        create(own, free);
        create(other, first);
        mvc.perform(bearer(get("/api/results/me"), Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3));
        mvc.perform(bearer(get("/api/results/me").param("tab", "AVAILABLE"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].currentResultId").value(published.id().toString())).andExpect(jsonPath("$.content[0].canViewResult").value(true)).andExpect(jsonPath("$.content[0].canDownloadReport").value(true)).andExpect(jsonPath("$.content[0].reportDate").value(published.publishedAt().atZone(ZoneId.of("Asia/Jerusalem")).toLocalDate().toString()));
        mvc.perform(bearer(get("/api/results/me").param("tab", "PENDING"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content[0].reportDate").isEmpty()).andExpect(jsonPath("$.content[0].canViewResult").value(false)).andExpect(jsonPath("$.content[0].visitDetailsAvailable").value(false));
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), published.id().toString(), new ResultRequests.Correction("Synthetic revision"), List.of(UUID.randomUUID().toString()));
        mvc.perform(bearer(get("/api/results/me").param("tab", "AVAILABLE"), Role.PATIENT)).andExpect(jsonPath("$.content[0].currentResultId").value(published.id().toString()));
        assertEquals("DRAFT", correction.result().status().name());
    }

    @Test
    void currentMultiCategoryFilteringAndLiteralSearchHaveUniqueAccurateCounts() throws Exception {
        create(own, first);
        create(own, free);
        jdbc.update("INSERT INTO lab_test_categories(lab_test_id,category) VALUES (?,'THYROID'),(?,'BLOOD_TESTS')", first.getId(), first.getId());
        mvc.perform(bearer(get("/api/results/me").param("category", "THYROID"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].categories.length()").value(2));
        mvc.perform(bearer(get("/api/results/me").param("search", "first").param("category", "BLOOD_TESTS"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1));
        jdbc.update("DELETE FROM lab_test_categories WHERE lab_test_id=?", first.getId());
        mvc.perform(bearer(get("/api/results/me").param("category", "THYROID"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        var literal = tests.saveAndFlush(new LabTest("LITERAL", "Synthetic 100%_\\ literal", null, BigDecimal.ONE, "SYNTHETIC", null));
        create(own, literal);
        for (String search : List.of("%", "_", "\\"))
            mvc.perform(bearer(get("/api/results/me").param("search", search), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void cancelledUnpublishedRowsDisappearButPublishedAccessAndRealLinksRemain() throws Exception {
        var p = prepared(create(own, first));
        var published = publish(p.result());
        var pending = create(own, free);
        state(pending.id(), "CANCELLED");
        state(p.result().orderId(), "CANCELLED");
        mvc.perform(bearer(get("/api/results/me"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].currentResultId").value(published.id().toString())).andExpect(jsonPath("$.content[0].visitDetailsAvailable").value(true)).andExpect(jsonPath("$.content[0].visitIds[0]").value(p.visit().id().toString()));
        mvc.perform(bearer(get("/api/results/me").param("tab", "PENDING"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void pagingStrictFiltersAndUnlinkedIdentityCannotBypassOwnership() throws Exception {
        create(own, first);
        create(own, free);
        create(other, first);
        mvc.perform(bearer(get("/api/results/me").param("size", "1"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.content.length()").value(1));
        mvc.perform(bearer(get("/api/results/me").param("page", "2147483647").param("size", "100"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content").isEmpty());
        error(mvc.perform(bearer(get("/api/results/me").param("patientId", other.getId().toString()), Role.PATIENT)), 400, "VALIDATION_ERROR", "patientId");
        error(mvc.perform(bearer(get("/api/results/me").param("tab", "ALL", "ALL"), Role.PATIENT)), 400, "VALIDATION_ERROR", "tab");
        error(mvc.perform(bearer(get("/api/results/me").param("category", "All"), Role.PATIENT)), 400, "VALIDATION_ERROR", "category");
        jdbc.update("UPDATE patients SET user_id=null WHERE id=?", own.getId());
        error(mvc.perform(bearer(get("/api/results/me"), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
    }

    @Test
    void staffQueueShowsWorkingIdentifiersOnlyToLaboratoryStaff() throws Exception {
        var p = prepared(create(own, first));
        mvc.perform(bearer(get("/api/results/work-items").param("orderId", p.result().orderId().toString()), Role.LAB_TECHNICIAN)).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].workingResultId").value(p.result().id().toString())).andExpect(jsonPath("$.content[0].workingState").value("DRAFT"));
        error(mvc.perform(bearer(get("/api/results/work-items"), Role.ADMIN)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/results/work-items"), Role.PATIENT)), 403, "FORBIDDEN", null);
        var response = mvc.perform(bearer(get("/api/results/me"), Role.PATIENT)).andReturn().getResponse().getContentAsString();
        assertFalse(response.contains(p.result().id().toString()));
        assertFalse(response.contains("DRAFT"));
        assertFalse(response.contains("numericValue"));
    }
}
