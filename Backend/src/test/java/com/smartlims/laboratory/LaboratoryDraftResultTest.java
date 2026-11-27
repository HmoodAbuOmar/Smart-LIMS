package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
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

class LaboratoryDraftResultTest extends LaboratoryTestSupport {
    @Test
    void draftListShowsSavedDraftsAndSearchesPatientFileAndOrder() throws Exception {
        define(first.getId());
        define(free.getId());
        var firstOrder = create(own, first);
        var freeOrder = create(own, free);
        var pendingOrder = create(own, first);
        arrive(firstOrder, null);
        arrive(freeOrder, null);
        arrive(pendingOrder, null);
        var firstDraft = createDraft(firstOrder.items().getFirst().id());
        var freeDraft = createDraft(freeOrder.items().getFirst().id());

        var rows = draftRows(read("/api/results/work-items?size=100").get("content"));
        assertEquals(List.of(freeDraft, firstDraft).stream().sorted().toList(), rows.stream().map(DraftRow::resultId).sorted().toList());
        assertTrue(rows.stream().noneMatch(row -> row.orderNumber().equals(pendingOrder.orderNumber())));
        var listed = rows.stream().filter(row -> row.resultId().equals(firstDraft)).findFirst().orElseThrow();
        assertEquals("Synthetic first test", listed.testName());
        assertEquals("Synthetic workflow profile", listed.patientName());
        assertEquals(own.getPatientNumber(), listed.patientNumber());
        assertEquals(firstOrder.orderNumber(), listed.orderNumber());

        assertEquals(List.of(firstDraft), filter(rows, "synthetic first").stream().map(DraftRow::resultId).toList());
        assertEquals(2, filter(rows, "workflow").size());
        assertEquals(2, filter(rows, own.getPatientNumber()).size());
        assertEquals(List.of(freeDraft), filter(rows, freeOrder.orderNumber()).stream().map(DraftRow::resultId).toList());
        assertTrue(filter(rows, "PF-10421").isEmpty());
        error(mvc.perform(bearer(get("/api/results/work-items"), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    @Test
    void editorLoadsTheDraftAndBothSavesKeepItDraft() throws Exception {
        define(first.getId());
        var order = create(own, first);
        var visit = arrive(order, null);
        var itemId = order.items().getFirst().id();
        var blood = received(visit, itemId, "Blood");
        var serum = received(visit, itemId, "Serum");
        var waiting = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Urine", "Cup", null, null), List.of(UUID.randomUUID().toString())).sample();
        var rejected = received(visit, itemId, "Plasma");
        sampleService.reject(actor(Role.LAB_TECHNICIAN), rejected.id().toString(), new SampleRequests.Reject(rejected.version(), "Quantity not sufficient"));
        var draftId = createDraft(itemId);

        var draft = read("/api/results/" + draftId);
        var samples = read("/api/samples?orderId=" + order.id()).get("content");
        var visits = read("/api/visits?orderId=" + order.id()).get("content");
        assertEquals(draftId, draft.get("id").asString());
        assertEquals("DRAFT", draft.get("status").asString());
        assertEquals(1, draft.get("versionNumber").asInt());
        assertEquals("Synthetic first test", draft.get("testName").asString());
        assertEquals("Synthetic workflow profile", draft.get("patient").get("name").asString());
        assertEquals(own.getPatientNumber(), draft.get("patient").get("number").asString());
        assertEquals(order.orderNumber(), draft.get("orderNumber").asString());
        assertEquals(Set.of("SYN_NUM", "SYN_TEXT"), codes(draft));
        assertEquals(Set.of(blood.id().toString(), serum.id().toString()), eligible(samples, visits, itemId.toString()));
        assertFalse(eligible(samples, visits, itemId.toString()).contains(waiting.id().toString()));
        assertFalse(eligible(samples, visits, itemId.toString()).contains(rejected.id().toString()));

        var measured = LaboratoryInput.now().minusSeconds(90);
        var saved = save(draftId, body(draft, measured, List.of(blood.id().toString()), "13.2", "HIGH", "Recheck"));
        assertEquals(draftId, saved.get("id").asString());
        assertEquals("DRAFT", saved.get("status").asString());
        assertTrue(saved.get("approvedAt").isNull());
        assertEquals(measured, Instant.parse(saved.get("measuredAt").asString()));
        assertEquals(List.of(blood.id().toString()), specimenIds(saved));
        var numeric = value(saved, "SYN_NUM");
        assertEquals(0, new BigDecimal("13.2").compareTo(numeric.get("numericValue").decimalValue()));
        assertTrue(numeric.get("numericComparator").isNull());
        assertEquals("synthetic-unit", numeric.get("unit").asString());
        assertEquals(0, new BigDecimal("12").compareTo(numeric.get("referenceMin").decimalValue()));
        assertEquals(0, new BigDecimal("16").compareTo(numeric.get("referenceMax").decimalValue()));
        assertEquals("HIGH", numeric.get("flag").asString());
        assertEquals("Recheck", numeric.get("notes").asString());
        assertEquals("Synthetic qualitative", value(saved, "SYN_TEXT").get("textValue").asString());

        var reviewed = save(draftId, body(saved, measured, List.of(blood.id().toString(), serum.id().toString()), "11.4", "HIGH", "Recheck"));
        assertEquals("DRAFT", reviewed.get("status").asString());
        assertTrue(reviewed.get("approvedAt").isNull());
        assertEquals(Set.of(blood.id().toString(), serum.id().toString()), Set.copyOf(specimenIds(reviewed)));

        error(mvc.perform(bearer(put("/api/results/" + draftId), Role.LAB_TECHNICIAN).contentType("application/json").content(json.writeValueAsString(body(draft, measured, List.of(blood.id().toString()), "13.2", "HIGH", "Recheck")))), 409, "RESULT_CHANGED", null);
        var future = body(reviewed, LaboratoryInput.now().plusSeconds(120), List.of(blood.id().toString()), "13.2", "HIGH", "Recheck");
        error(mvc.perform(bearer(put("/api/results/" + draftId), Role.LAB_TECHNICIAN).contentType("application/json").content(json.writeValueAsString(future))), 400, "VALIDATION_ERROR", "measuredAt");
        var rejectedBody = body(reviewed, measured, List.of(rejected.id().toString()), "13.2", "HIGH", "Recheck");
        error(mvc.perform(bearer(put("/api/results/" + draftId), Role.LAB_TECHNICIAN).contentType("application/json").content(json.writeValueAsString(rejectedBody))), 409, "RESULT_SPECIMEN_UNAVAILABLE", null);
        error(mvc.perform(bearer(get("/api/results/" + draftId), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    private String createDraft(UUID orderItemId) throws Exception {
        var saved = json.readTree(mvc.perform(bearer(post("/api/results"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content("{\"orderItemId\":\"" + orderItemId + "\"}"))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertEquals("DRAFT", saved.get("status").asString());
        return saved.get("id").asString();
    }

    private com.smartlims.samples.dto.SampleResponse received(VisitResponse visit, UUID itemId, String sampleType) {
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), sampleType, "Tube", LaboratoryInput.now().minusSeconds(300).toString(), null), List.of(UUID.randomUUID().toString())).sample();
        sampleService.receive(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Revision(created.version()));
        return sampleService.attest(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Attest(itemId.toString()));
    }

    private JsonNode save(String id, Map<String, Object> body) throws Exception {
        return json.readTree(mvc.perform(bearer(put("/api/results/" + id), Role.LAB_TECHNICIAN).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private Map<String, Object> body(JsonNode draft, Instant measured, List<String> specimenIds, String numeric, String flag, String note) {
        var values = new ArrayList<Map<String, Object>>();
        for (var row : draft.get("values")) {
            var numericRow = "NUMERIC".equals(row.get("resultType").asString());
            var value = new LinkedHashMap<String, Object>();
            value.put("parameterId", row.get("parameterId").asString());
            value.put("numericValue", numericRow ? new BigDecimal(numeric) : null);
            value.put("numericComparator", null);
            value.put("textValue", numericRow ? null : "Synthetic qualitative");
            value.put("referenceText", null);
            value.put("referenceMin", numericRow ? new BigDecimal("12") : null);
            value.put("referenceMax", numericRow ? new BigDecimal("16") : null);
            value.put("flag", numericRow ? flag : "NOT_EVALUATED");
            value.put("notes", numericRow ? note : null);
            values.add(value);
        }
        var body = new LinkedHashMap<String, Object>();
        body.put("expectedVersion", draft.get("version").asLong());
        body.put("measuredAt", measured.toString());
        body.put("specimenIds", specimenIds);
        body.put("explanation", null);
        body.put("values", values);
        return body;
    }

    private JsonNode read(String path) throws Exception {
        return json.readTree(mvc.perform(bearer(get(path), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private List<DraftRow> draftRows(JsonNode items) {
        var rows = new ArrayList<DraftRow>();
        for (var item : items) {
            if (!"DRAFT".equals(text(item, "workingState")) || text(item, "workingResultId").isEmpty())
                continue;
            rows.add(new DraftRow(item.get("workingResultId").asString(), text(item, "testName"), text(item, "patientName"), text(item, "patientNumber"), text(item, "orderNumber")));
        }
        rows.sort(Comparator.comparing(DraftRow::orderNumber).thenComparing(DraftRow::testName).thenComparing(DraftRow::resultId));
        return rows;
    }

    private List<DraftRow> filter(List<DraftRow> rows, String query) {
        var text = query.trim().toLowerCase(Locale.ROOT);
        return rows.stream().filter(row -> List.of(row.testName(), row.patientName(), row.patientNumber(), row.orderNumber()).stream().anyMatch(value -> value.toLowerCase(Locale.ROOT).contains(text))).toList();
    }

    private Set<String> eligible(JsonNode samples, JsonNode visits, String orderItemId) {
        var visitIds = new HashSet<String>();
        for (var visit : visits) {
            var linked = false;
            for (var test : visit.get("tests"))
                linked = linked || orderItemId.equals(test.get("orderItemId").asString());
            if (linked)
                visitIds.add(visit.get("id").asString());
        }
        var ids = new LinkedHashSet<String>();
        for (var sample : samples) {
            if (!"RECEIVED".equals(sample.get("status").asString()))
                continue;
            var attested = false;
            for (var link : sample.get("attestations"))
                attested = attested || orderItemId.equals(link.get("orderItemId").asString());
            if (visitIds.contains(text(sample, "visitId")) || attested)
                ids.add(sample.get("id").asString());
        }
        return ids;
    }

    private Set<String> codes(JsonNode draft) {
        var codes = new LinkedHashSet<String>();
        draft.get("values").forEach(row -> codes.add(row.get("code").asString()));
        return codes;
    }

    private JsonNode value(JsonNode draft, String code) {
        for (var row : draft.get("values"))
            if (code.equals(row.get("code").asString()))
                return row;
        throw new AssertionError(code);
    }

    private List<String> specimenIds(JsonNode draft) {
        var ids = new ArrayList<String>();
        draft.get("specimens").forEach(sample -> ids.add(sample.get("id").asString()));
        return ids;
    }

    private String text(JsonNode node, String field) {
        var value = node.get(field);
        return value == null || value.isNull() ? "" : value.asString();
    }

    private record DraftRow(String resultId, String testName, String patientName, String patientNumber, String orderNumber) {
    }
}
