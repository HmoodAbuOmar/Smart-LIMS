package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.samples.dto.SampleRequests;

import java.time.Instant;
import java.util.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LaboratorySampleDetailsTest extends LaboratoryTestSupport {
    @Test
    void detailsShowTheRejectedSampleItsTestsAndTheReplacementBarcode() throws Exception {
        var order = create(own, first, free);
        var visit = arrive(order, null);
        var collected = LaboratoryInput.now().minusSeconds(120);
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Serum", "Gel tube", collected.toString(), null), List.of(UUID.randomUUID().toString())).sample();
        var received = sampleService.receive(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Revision(created.version()));
        sampleService.attest(actor(Role.LAB_TECHNICIAN), received.id().toString(), new SampleRequests.Attest(order.items().get(0).id().toString()));
        sampleService.attest(actor(Role.LAB_TECHNICIAN), received.id().toString(), new SampleRequests.Attest(order.items().get(1).id().toString()));
        sampleService.reject(actor(Role.LAB_TECHNICIAN), received.id().toString(), new SampleRequests.Reject(received.version(), "Quantity not sufficient"));

        var sample = read("/api/samples/" + received.id());
        var names = testNames(order.id());
        var siblings = samples(order.id());
        assertEquals(received.barcode(), sample.get("barcode").asString());
        assertEquals(order.orderNumber(), names.orderNumber());
        assertEquals("Synthetic workflow profile", names.patientName());
        assertEquals("REJECTED", sample.get("status").asString());
        assertEquals("Serum", sample.get("sampleType").asString());
        assertEquals("Gel tube", sample.get("containerType").asString());
        assertEquals(collected, Instant.parse(sample.get("collectedAt").asString()));
        assertEquals(received.receivedAt(), Instant.parse(sample.get("receivedAt").asString()));
        assertEquals("Quantity not sufficient", sample.get("rejectionReason").asString());
        assertTrue(sample.get("replacesSampleId").isNull());
        assertFalse(sample.has("notes"));
        assertEquals("", replacementBarcode(sample, siblings));
        assertEquals(new Actions(false, false, true), actions(sample.get("status").asString()));
        assertEquals(Set.of(order.items().get(0).id().toString(), order.items().get(1).id().toString()), attestationIds(sample));
        assertEquals(Set.of("Synthetic first test", "Synthetic free test"), Set.copyOf(names.tests().values()));
        assertNull(names.drafts().get(order.items().getFirst().id().toString()));

        error(mvc.perform(bearer(post("/api/samples/" + received.id() + "/receive"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":" + sample.get("version").asLong() + "}")), 409, "SAMPLE_STATE_CONFLICT", null);

        var replacementTime = LaboratoryInput.now().minusSeconds(30);
        var body = Map.<String, Object>of(
                "visitId", sample.get("visitId").asString(),
                "sampleType", "Serum",
                "containerType", "Gel tube",
                "collectedAt", replacementTime.toString(),
                "replacesSampleId", received.id().toString());
        var saved = json.readTree(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        var after = samples(order.id());
        assertEquals(saved.get("barcode").asString(), replacementBarcode(sample, after));
        assertEquals(received.barcode(), replacementBarcode(saved, after));
    }

    @Test
    void receiptAndOpenTestUseTheDetailVersionAndTheLinkedOrderItem() throws Exception {
        var order = create(own, first);
        define(order.items().getFirst().labTestId());
        var visit = arrive(order, null);
        var collected = LaboratoryInput.now().minusSeconds(60);
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Serum", "Gel tube", collected.toString(), null), List.of(UUID.randomUUID().toString())).sample();
        var sample = read("/api/samples/" + created.id());
        assertEquals("REGISTERED", sample.get("status").asString());
        assertTrue(sample.get("receivedAt").isNull());
        assertTrue(sample.get("rejectionReason").isNull());
        assertEquals(0, sample.get("attestations").size());
        assertEquals(new Actions(true, true, false), actions(sample.get("status").asString()));

        error(mvc.perform(bearer(post("/api/samples/" + created.id() + "/receive"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":4}")), 409, "SAMPLE_CHANGED", null);
        var received = read(mvc.perform(bearer(post("/api/samples/" + created.id() + "/receive"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":" + sample.get("version").asLong() + "}"))
                .andExpect(status().isOk()));
        assertEquals(created.id().toString(), received.get("id").asString());
        assertEquals("RECEIVED", received.get("status").asString());
        assertEquals(collected, Instant.parse(received.get("collectedAt").asString()));
        assertFalse(received.get("receivedAt").isNull());
        var repeated = read(mvc.perform(bearer(post("/api/samples/" + created.id() + "/receive"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":" + sample.get("version").asLong() + "}"))
                .andExpect(status().isOk()));
        assertEquals("RECEIVED", repeated.get("status").asString());
        assertEquals(received.get("receivedAt").asString(), repeated.get("receivedAt").asString());

        sampleService.attest(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Attest(order.items().getFirst().id().toString()));
        var itemId = order.items().getFirst().id().toString();
        assertNull(testNames(order.id()).drafts().get(itemId));
        var draft = json.readTree(mvc.perform(bearer(post("/api/results"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content("{\"orderItemId\":\"" + itemId + "\"}"))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertEquals(itemId, draft.get("orderItemId").asString());
        assertEquals("DRAFT", draft.get("status").asString());
        assertEquals(draft.get("id").asString(), testNames(order.id()).drafts().get(itemId));
        error(mvc.perform(bearer(post("/api/results"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content("{\"orderItemId\":\"" + itemId + "\"}")), 409, "RESULT_WORKING_VERSION_EXISTS", null);
        var versions = read("/api/results/versions?orderItemId=" + itemId);
        assertEquals(draft.get("id").asString(), versions.get("content").get(0).get("id").asString());
        assertEquals("DRAFT", versions.get("content").get(0).get("status").asString());
        error(mvc.perform(bearer(get("/api/samples/" + created.id()), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    private JsonNode read(String path) throws Exception {
        return json.readTree(mvc.perform(bearer(get(path), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private JsonNode read(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        return json.readTree(result.andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private JsonNode samples(UUID orderId) throws Exception {
        return read("/api/samples?orderId=" + orderId).get("content");
    }

    private Set<String> attestationIds(JsonNode sample) {
        var ids = new LinkedHashSet<String>();
        sample.get("attestations").forEach(link -> ids.add(link.get("orderItemId").asString()));
        return ids;
    }

    private String replacementBarcode(JsonNode sample, JsonNode siblings) {
        var id = sample.get("id").asString();
        var replaces = text(sample, "replacesSampleId");
        JsonNode successor = null;
        JsonNode replaced = null;
        for (var item : siblings) {
            if (text(item, "replacesSampleId").equals(id))
                successor = item;
            if (item.get("id").asString().equals(replaces))
                replaced = item;
        }
        var chosen = successor != null ? successor : replaced;
        return chosen == null ? "" : chosen.get("barcode").asString();
    }

    private String text(JsonNode node, String field) {
        var value = node.get(field);
        return value == null || value.isNull() ? "" : value.asString();
    }

    private Actions actions(String status) {
        return new Actions(status.equals("REGISTERED"), status.equals("REGISTERED") || status.equals("RECEIVED"), status.equals("REJECTED"));
    }

    private ListedOrder testNames(UUID orderId) throws Exception {
        var body = read("/api/results/work-items?orderId=" + orderId);
        var names = new LinkedHashMap<String, String>();
        var drafts = new LinkedHashMap<String, String>();
        String orderNumber = "";
        String patientName = "";
        for (var item : body.get("content")) {
            if (orderNumber.isEmpty()) {
                orderNumber = item.get("orderNumber").asString();
                patientName = item.get("patientName").asString();
            }
            names.put(item.get("orderItemId").asString(), item.get("testName").asString());
            if (!text(item, "workingResultId").isEmpty() && "DRAFT".equals(text(item, "workingState")))
                drafts.put(item.get("orderItemId").asString(), item.get("workingResultId").asString());
        }
        return new ListedOrder(orderNumber, patientName, names, drafts);
    }

    private record Actions(boolean receive, boolean reject, boolean replace) {
    }

    private record ListedOrder(String orderNumber, String patientName, Map<String, String> tests, Map<String, String> drafts) {
    }
}
