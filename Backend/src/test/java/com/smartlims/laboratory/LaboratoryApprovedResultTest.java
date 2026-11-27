package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.labtests.dto.TestParameterRequest;
import com.smartlims.samples.dto.SampleRequests;
import com.smartlims.visits.dto.VisitResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LaboratoryApprovedResultTest extends LaboratoryTestSupport {
    @Test
    void approvedListShowsOnlyApprovedResultsAndSearchesTheRecord() throws Exception {
        define(first.getId());
        define(free.getId());
        var firstResult = approve(prepare(first));
        var freeResult = approve(prepare(free));
        var draftOnly = prepare(first);
        saveDraft(draftOnly);

        var rows = approvedRows(read("/api/results/work-items?size=100").get("content"));
        assertEquals(List.of(firstResult, freeResult).stream().sorted().toList(), rows.stream().map(ApprovedRow::resultId).sorted().toList());
        assertTrue(rows.stream().noneMatch(row -> row.resultId().equals(draftOnly.resultId())));
        var listed = rows.stream().filter(row -> row.resultId().equals(firstResult)).findFirst().orElseThrow();
        assertEquals("Synthetic first test", listed.testName());
        assertEquals("Synthetic workflow profile", listed.patientName());
        assertEquals(own.getPatientNumber(), listed.patientNumber());
        assertEquals(orderNumber(firstResult), listed.orderNumber());
        assertEquals(List.of(firstResult), filter(rows, "synthetic first").stream().map(ApprovedRow::resultId).toList());
        assertEquals(2, filter(rows, "workflow").size());
        assertEquals(2, filter(rows, own.getPatientNumber()).size());
        assertEquals(List.of(freeResult), filter(rows, orderNumber(freeResult)).stream().map(ApprovedRow::resultId).toList());
        assertTrue(filter(rows, "PF-10510").isEmpty());
    }

    @Test
    void reviewScreenPublishesACompleteApprovalAndKeepsPreviewAndEditSeparate() throws Exception {
        define(first.getId());
        parameterService.save(actor(Role.ADMIN), first.getId().toString(), null, new TestParameterRequest("SYN_CMP", "Synthetic compared", "NUMERIC", "ng/dL", null, 2, false, true, null));
        var incomplete = prepare(first);
        error(reviewed(post("/api/results/" + incomplete.resultId() + "/approve"), "{\"expectedVersion\":" + incomplete.version() + "}"), 409, "RESULT_INCOMPLETE", null);

        var prepared = prepare(first);
        var draft = saveDraft(prepared);
        error(mvc.perform(bearer(post("/api/results/" + prepared.resultId() + "/approve"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":" + draft.get("version").asLong() + "}")), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(post("/api/results/" + prepared.resultId() + "/approve"), Role.ADMIN).contentType("application/json").content("{\"expectedVersion\":" + draft.get("version").asLong() + "}")), 403, "FORBIDDEN", null);
        var approved = accepted(post("/api/results/" + prepared.resultId() + "/approve"), "{\"expectedVersion\":" + draft.get("version").asLong() + "}");
        assertEquals("APPROVED", approved.get("status").asString());
        assertEquals(prepared.resultId(), approved.get("id").asString());
        assertFalse(approved.get("approvedAt").isNull());
        assertEquals("Synthetic first test", approved.get("testName").asString());
        assertEquals("Synthetic workflow profile", approved.get("patient").get("name").asString());
        assertEquals(own.getPatientNumber(), approved.get("patient").get("number").asString());
        assertEquals(prepared.orderNumber(), approved.get("orderNumber").asString());
        assertFalse(approved.get("measuredAt").isNull());
        assertTrue(Instant.parse(approved.get("measuredAt").asString()).isBefore(Instant.now()));
        var specimen = approved.get("specimens").get(0);
        assertEquals("RECEIVED", specimen.get("status").asString());
        assertFalse(specimen.get("attestedAt").isNull());
        assertFalse(specimen.get("barcode").asString().isBlank());
        var numeric = value(approved, "SYN_NUM");
        var compared = value(approved, "SYN_CMP");
        assertEquals("2.4", shown(numeric));
        assertEquals("NORMAL", numeric.get("flag").asString());
        assertTrue(numeric.get("notes").isNull());
        assertEquals(0, new BigDecimal("0.4").compareTo(numeric.get("referenceMin").decimalValue()));
        assertEquals(0, new BigDecimal("4.0").compareTo(numeric.get("referenceMax").decimalValue()));
        assertEquals("< 0.8", shown(compared));
        assertEquals("LOW", compared.get("flag").asString());
        assertEquals("Borderline", compared.get("notes").asString());
        assertTrue(approvedRows(read("/api/results/work-items?size=100").get("content")).stream().anyMatch(row -> row.resultId().equals(prepared.resultId())));

        error(mvc.perform(bearer(post("/api/results/" + prepared.resultId() + "/publish"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":" + approved.get("version").asLong() + "}")), 403, "FORBIDDEN", null);
        var edited = save(prepared.resultId(), measurement(approved, prepared.measured(), prepared.sampleId()));
        assertEquals("DRAFT", edited.get("status").asString());
        assertTrue(edited.get("approvedAt").isNull());
        assertTrue(approvedRows(read("/api/results/work-items?size=100").get("content")).stream().noneMatch(row -> row.resultId().equals(prepared.resultId())));

        var restored = accepted(post("/api/results/" + prepared.resultId() + "/approve"), "{\"expectedVersion\":" + edited.get("version").asLong() + "}");
        error(reviewed(post("/api/results/" + prepared.resultId() + "/publish"), "{\"expectedVersion\":" + approved.get("version").asLong() + "}"), 409, "RESULT_CHANGED", null);
        var published = accepted(post("/api/results/" + prepared.resultId() + "/publish"), "{\"expectedVersion\":" + restored.get("version").asLong() + "}");
        assertEquals(prepared.resultId(), published.get("id").asString());
        assertEquals("PUBLISHED", published.get("status").asString());
        assertFalse(published.get("publishedAt").isNull());
        assertTrue(approvedRows(read("/api/results/work-items?size=100").get("content")).stream().noneMatch(row -> row.resultId().equals(prepared.resultId())));
        error(mvc.perform(bearer(get("/api/results/" + prepared.resultId()), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    private Prepared prepare(com.smartlims.labtests.entity.LabTest test) throws Exception {
        var order = create(own, test);
        var visit = arrive(order, null);
        var itemId = order.items().getFirst().id();
        var sample = collect(visit, itemId);
        var created = json.readTree(mvc.perform(bearer(post("/api/results"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content("{\"orderItemId\":\"" + itemId + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray());
        return new Prepared(created.get("id").asString(), created.get("version").asLong(), order.orderNumber(), sample.id().toString(), LaboratoryInput.now().minusSeconds(60));
    }

    private com.smartlims.samples.dto.SampleResponse collect(VisitResponse visit, UUID itemId) {
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Serum", "Tube", LaboratoryInput.now().minusSeconds(300).toString(), null), List.of(UUID.randomUUID().toString())).sample();
        sampleService.receive(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Revision(created.version()));
        return sampleService.attest(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Attest(itemId.toString()));
    }

    private JsonNode saveDraft(Prepared prepared) throws Exception {
        return save(prepared.resultId(), measurement(read("/api/results/" + prepared.resultId()), prepared.measured(), prepared.sampleId()));
    }

    private String approve(Prepared prepared) throws Exception {
        var draft = saveDraft(prepared);
        var approved = accepted(post("/api/results/" + prepared.resultId() + "/approve"), "{\"expectedVersion\":" + draft.get("version").asLong() + "}");
        assertEquals("APPROVED", approved.get("status").asString());
        return approved.get("id").asString();
    }

    private org.springframework.test.web.servlet.ResultActions reviewed(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(request.header("Authorization", "Bearer " + reviewerToken).contentType("application/json").content(body));
    }

    private JsonNode accepted(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body) throws Exception {
        return json.readTree(reviewed(request, body).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private JsonNode save(String id, Map<String, Object> body) throws Exception {
        return json.readTree(mvc.perform(bearer(put("/api/results/" + id), Role.LAB_TECHNICIAN).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private Map<String, Object> measurement(JsonNode draft, Instant measured, String specimenId) {
        var values = new ArrayList<Map<String, Object>>();
        for (var row : draft.get("values")) {
            var code = row.get("code").asString();
            var numeric = "NUMERIC".equals(row.get("resultType").asString());
            var value = new LinkedHashMap<String, Object>();
            value.put("parameterId", row.get("parameterId").asString());
            value.put("numericValue", !numeric ? null : "SYN_CMP".equals(code) ? new BigDecimal("0.8") : new BigDecimal("2.4"));
            value.put("numericComparator", "SYN_CMP".equals(code) ? "<" : null);
            value.put("textValue", null);
            value.put("referenceText", null);
            value.put("referenceMin", !numeric ? null : "SYN_CMP".equals(code) ? new BigDecimal("0.8") : new BigDecimal("0.4"));
            value.put("referenceMax", !numeric ? null : "SYN_CMP".equals(code) ? new BigDecimal("1.8") : new BigDecimal("4.0"));
            value.put("flag", !numeric ? "NOT_EVALUATED" : "SYN_CMP".equals(code) ? "LOW" : "NORMAL");
            value.put("notes", "SYN_CMP".equals(code) ? "Borderline" : null);
            values.add(value);
        }
        var body = new LinkedHashMap<String, Object>();
        body.put("expectedVersion", draft.get("version").asLong());
        body.put("measuredAt", measured.toString());
        body.put("specimenIds", List.of(specimenId));
        body.put("explanation", null);
        body.put("values", values);
        return body;
    }

    private JsonNode read(String path) throws Exception {
        return json.readTree(mvc.perform(bearer(get(path), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private String orderNumber(String resultId) throws Exception {
        return read("/api/results/" + resultId).get("orderNumber").asString();
    }

    private List<ApprovedRow> approvedRows(JsonNode items) {
        var rows = new ArrayList<ApprovedRow>();
        for (var item : items) {
            if (!"APPROVED".equals(text(item, "workingState")) || text(item, "workingResultId").isEmpty())
                continue;
            rows.add(new ApprovedRow(item.get("workingResultId").asString(), text(item, "testName"), text(item, "patientName"), text(item, "patientNumber"), text(item, "orderNumber")));
        }
        rows.sort(Comparator.comparing(ApprovedRow::orderNumber).thenComparing(ApprovedRow::testName).thenComparing(ApprovedRow::resultId));
        return rows;
    }

    private List<ApprovedRow> filter(List<ApprovedRow> rows, String query) {
        var text = query.trim().toLowerCase(Locale.ROOT);
        return rows.stream().filter(row -> List.of(row.testName(), row.patientName(), row.patientNumber(), row.orderNumber()).stream().anyMatch(value -> value.toLowerCase(Locale.ROOT).contains(text))).toList();
    }

    private JsonNode value(JsonNode result, String code) {
        for (var row : result.get("values"))
            if (code.equals(row.get("code").asString()))
                return row;
        throw new AssertionError(code);
    }

    private String shown(JsonNode value) {
        if (!value.get("textValue").isNull() && value.get("textValue").asString().trim().length() > 0 && value.get("numericValue").isNull())
            return value.get("textValue").asString().trim();
        if (value.get("numericValue").isNull())
            return "";
        var number = value.get("numericValue").decimalValue().stripTrailingZeros().toPlainString();
        var comparator = text(value, "numericComparator");
        return comparator.isEmpty() ? number : comparator + " " + number;
    }

    private String text(JsonNode node, String field) {
        var value = node.get(field);
        return value == null || value.isNull() ? "" : value.asString();
    }

    private record Prepared(String resultId, long version, String orderNumber, String sampleId, Instant measured) {
    }

    private record ApprovedRow(String resultId, String testName, String patientName, String patientNumber, String orderNumber) {
    }
}
