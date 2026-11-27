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

class LaboratoryPublishedResultTest extends LaboratoryTestSupport {
    @Test
    void publishedListOpensTheCurrentReportAndSearchesTheRecord() throws Exception {
        define(first.getId());
        define(free.getId());
        var firstReport = publish(fill(prepare(first)));
        var freeReport = publish(fill(prepare(free)));
        var draftOnly = prepare(first);
        var correction = correct(firstReport);

        var rows = publishedRows(items());
        assertEquals(List.of(firstReport, freeReport).stream().sorted().toList(), rows.stream().map(Row::resultId).sorted().toList());
        assertTrue(rows.stream().noneMatch(row -> row.resultId().equals(draftOnly) || row.resultId().equals(correction)));
        var listed = rows.stream().filter(row -> row.resultId().equals(firstReport)).findFirst().orElseThrow();
        assertEquals("Synthetic first test", listed.testName());
        assertEquals("Synthetic workflow profile", listed.patientName());
        assertEquals(own.getPatientNumber(), listed.patientNumber());
        assertEquals(orderNumber(firstReport), listed.orderNumber());
        var item = itemFor(listed.orderItemId());
        assertEquals(firstReport, item.get("currentResultId").asString());
        assertEquals(correction, item.get("workingResultId").asString());
        assertEquals("DRAFT", item.get("workingState").asString());
        assertEquals(List.of(firstReport), filter(rows, "synthetic first").stream().map(Row::resultId).toList());
        assertEquals(2, filter(rows, "workflow").size());
        assertEquals(2, filter(rows, own.getPatientNumber()).size());
        assertEquals(List.of(freeReport), filter(rows, orderNumber(freeReport)).stream().map(Row::resultId).toList());
        assertTrue(filter(rows, "PF-10421").isEmpty());
    }

    @Test
    void reportShowsThePublishedValuesAndTheFullVersionHistory() throws Exception {
        define(first.getId());
        parameterService.save(actor(Role.ADMIN), first.getId().toString(), null, new TestParameterRequest("SYN_CMP", "Synthetic compared", "NUMERIC", "ng/dL", null, 2, false, true, null));
        var prepared = prepare(first);
        var firstVersion = publish(fill(read("/api/results/" + prepared)));
        var secondDraft = correct(firstVersion);
        var secondVersion = publish(fill(read("/api/results/" + secondDraft)));
        var thirdDraft = correct(secondVersion);

        var report = read("/api/results/" + secondVersion);
        assertEquals("PUBLISHED", report.get("status").asString());
        assertEquals(2, report.get("versionNumber").asInt());
        assertTrue(report.get("isCurrent").asBoolean());
        assertEquals("Synthetic first test", report.get("testName").asString());
        assertEquals("Synthetic workflow profile", report.get("patient").get("name").asString());
        assertEquals(own.getPatientNumber(), report.get("patient").get("number").asString());
        assertEquals(orderNumber(secondVersion), report.get("orderNumber").asString());
        assertFalse(report.get("approvedAt").isNull());
        assertFalse(report.get("publishedAt").isNull());
        assertEquals(preparedSamples(prepared), barcodes(report));
        assertEquals("2.4", shown(value(report, "SYN_NUM")));
        assertEquals("NORMAL", value(report, "SYN_NUM").get("flag").asString());
        assertTrue(value(report, "SYN_NUM").get("notes").isNull());
        assertEquals(0, new BigDecimal("12").compareTo(value(report, "SYN_NUM").get("referenceMin").decimalValue()));
        assertEquals(0, new BigDecimal("16").compareTo(value(report, "SYN_NUM").get("referenceMax").decimalValue()));
        assertEquals("< 0.8", shown(value(report, "SYN_CMP")));
        assertEquals("LOW", value(report, "SYN_CMP").get("flag").asString());
        assertEquals("Borderline", value(report, "SYN_CMP").get("notes").asString());
        assertEquals("DRAFT", read("/api/results/" + thirdDraft).get("status").asString());

        var history = history(report.get("orderItemId").asString());
        assertEquals(List.of(3, 2, 1), history.stream().map(row -> row.get("versionNumber").asInt()).toList());
        assertEquals("DRAFT", history.get(0).get("status").asString());
        assertFalse(history.get(0).get("isCurrent").asBoolean());
        assertTrue(history.get(0).get("approvedAt").isNull());
        assertTrue(history.get(0).get("publishedAt").isNull());
        assertEquals("PUBLISHED", history.get(1).get("status").asString());
        assertTrue(history.get(1).get("isCurrent").asBoolean());
        assertEquals(secondVersion, history.get(1).get("id").asString());
        assertFalse(history.get(1).get("approvedAt").isNull());
        assertFalse(history.get(1).get("publishedAt").isNull());
        assertEquals("PUBLISHED", history.get(2).get("status").asString());
        assertFalse(history.get(2).get("isCurrent").asBoolean());
        assertEquals(firstVersion, history.get(2).get("id").asString());
        error(mvc.perform(bearer(get("/api/results/" + secondVersion), Role.PATIENT)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/results/versions").param("orderItemId", report.get("orderItemId").asString()), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    private String prepare(com.smartlims.labtests.entity.LabTest test) throws Exception {
        var order = create(own, test);
        var visit = arrive(order, null);
        var itemId = order.items().getFirst().id();
        collect(visit, itemId, "Blood");
        collect(visit, itemId, "Serum");
        var created = json.readTree(mvc.perform(bearer(post("/api/results"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content("{\"orderItemId\":\"" + itemId + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray());
        return created.get("id").asString();
    }

    private com.smartlims.samples.dto.SampleResponse collect(VisitResponse visit, UUID itemId, String sampleType) {
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), sampleType, "Tube", LaboratoryInput.now().minusSeconds(300).toString(), null), List.of(UUID.randomUUID().toString())).sample();
        sampleService.receive(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Revision(created.version()));
        return sampleService.attest(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Attest(itemId.toString()));
    }

    private JsonNode fill(String resultId) throws Exception {
        return fill(read("/api/results/" + resultId));
    }

    private JsonNode fill(JsonNode draft) throws Exception {
        var specimens = new ArrayList<String>();
        read("/api/samples?orderId=" + draft.get("orderId").asString()).get("content").forEach(sample -> {
            if ("RECEIVED".equals(sample.get("status").asString()))
                specimens.add(sample.get("id").asString());
        });
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
            value.put("referenceMin", !numeric ? null : "SYN_CMP".equals(code) ? new BigDecimal("0.8") : new BigDecimal("12"));
            value.put("referenceMax", !numeric ? null : "SYN_CMP".equals(code) ? new BigDecimal("1.8") : new BigDecimal("16"));
            value.put("flag", !numeric ? "NOT_EVALUATED" : "SYN_CMP".equals(code) ? "LOW" : "NORMAL");
            value.put("notes", "SYN_CMP".equals(code) ? "Borderline" : null);
            values.add(value);
        }
        var body = new LinkedHashMap<String, Object>();
        body.put("expectedVersion", draft.get("version").asLong());
        body.put("measuredAt", LaboratoryInput.now().minusSeconds(60).toString());
        body.put("specimenIds", specimens);
        body.put("explanation", null);
        body.put("values", values);
        return json.readTree(mvc.perform(bearer(put("/api/results/" + draft.get("id").asString()), Role.LAB_TECHNICIAN).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
    }

    private String publish(JsonNode draft) throws Exception {
        var approved = accepted(post("/api/results/" + draft.get("id").asString() + "/approve"), draft.get("version").asLong());
        var published = accepted(post("/api/results/" + draft.get("id").asString() + "/publish"), approved.get("version").asLong());
        assertEquals("PUBLISHED", published.get("status").asString());
        return published.get("id").asString();
    }

    private String correct(String resultId) throws Exception {
        var saved = json.readTree(mvc.perform(bearer(post("/api/results/" + resultId + "/corrections"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content("{\"reason\":\"Synthetic correction\"}"))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertEquals("DRAFT", saved.get("status").asString());
        return saved.get("id").asString();
    }

    private JsonNode accepted(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, long version) throws Exception {
        return json.readTree(mvc.perform(request.header("Authorization", "Bearer " + reviewerToken).contentType("application/json").content("{\"expectedVersion\":" + version + "}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private JsonNode read(String path) throws Exception {
        return json.readTree(mvc.perform(bearer(get(path), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private JsonNode items() throws Exception {
        return read("/api/results/work-items?size=100").get("content");
    }

    private JsonNode itemFor(String orderItemId) throws Exception {
        for (var item : items())
            if (orderItemId.equals(item.get("orderItemId").asString()))
                return item;
        throw new AssertionError(orderItemId);
    }

    private String orderNumber(String resultId) throws Exception {
        return read("/api/results/" + resultId).get("orderNumber").asString();
    }

    private List<Row> publishedRows(JsonNode items) {
        var rows = new ArrayList<Row>();
        for (var item : items) {
            var id = text(item, "currentResultId");
            if (id.isEmpty())
                continue;
            rows.add(new Row(id, text(item, "testName"), text(item, "patientName"), text(item, "patientNumber"), text(item, "orderNumber"), item.get("orderItemId").asString()));
        }
        rows.sort(Comparator.comparing(Row::orderNumber).thenComparing(Row::testName).thenComparing(Row::resultId));
        return rows;
    }

    private List<Row> filter(List<Row> rows, String query) {
        var text = query.trim().toLowerCase(Locale.ROOT);
        return rows.stream().filter(row -> List.of(row.testName(), row.patientName(), row.patientNumber(), row.orderNumber()).stream().anyMatch(value -> value.toLowerCase(Locale.ROOT).contains(text))).toList();
    }

    private List<JsonNode> history(String orderItemId) throws Exception {
        var rows = new ArrayList<JsonNode>();
        read("/api/results/versions?orderItemId=" + orderItemId).get("content").forEach(rows::add);
        rows.sort(Comparator.comparingInt((JsonNode row) -> row.get("versionNumber").asInt()).reversed());
        return rows;
    }

    private Set<String> preparedSamples(String ignoredResultId) throws Exception {
        return barcodes(read("/api/results/" + ignoredResultId));
    }

    private Set<String> barcodes(JsonNode result) {
        var barcodes = new LinkedHashSet<String>();
        result.get("specimens").forEach(sample -> barcodes.add(sample.get("barcode").asString()));
        return barcodes;
    }

    private JsonNode value(JsonNode result, String code) {
        for (var row : result.get("values"))
            if (code.equals(row.get("code").asString()))
                return row;
        throw new AssertionError(code);
    }

    private String shown(JsonNode value) {
        if (value.get("numericValue").isNull())
            return text(value, "textValue");
        var number = value.get("numericValue").decimalValue().stripTrailingZeros().toPlainString();
        var comparator = text(value, "numericComparator");
        return comparator.isEmpty() ? number : comparator + " " + number;
    }

    private String text(JsonNode node, String field) {
        var value = node.get(field);
        return value == null || value.isNull() ? "" : value.asString();
    }

    private record Row(String resultId, String testName, String patientName, String patientNumber, String orderNumber, String orderItemId) {
    }
}
