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

class LaboratoryReplacementTest extends LaboratoryTestSupport {
    @Test
    void replacementScreenShowsTheRejectedSampleThenRecordsANewSpecimen() throws Exception {
        var order = create(own, first, free);
        var visit = arrive(order, null);
        var collected = LaboratoryInput.now().minusSeconds(90);
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Serum", "Gold", collected.toString(), null), List.of(UUID.randomUUID().toString())).sample();
        var received = sampleService.receive(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Revision(created.version()));
        sampleService.attest(actor(Role.LAB_TECHNICIAN), received.id().toString(), new SampleRequests.Attest(order.items().get(0).id().toString()));
        sampleService.attest(actor(Role.LAB_TECHNICIAN), received.id().toString(), new SampleRequests.Attest(order.items().get(1).id().toString()));
        sampleService.reject(actor(Role.LAB_TECHNICIAN), received.id().toString(), new SampleRequests.Reject(received.version(), "Quantity not sufficient"));

        var source = readSample(received.id());
        assertEquals("REJECTED", source.get("status").asString());
        assertEquals(received.barcode(), source.get("barcode").asString());
        assertEquals("Serum", source.get("sampleType").asString());
        assertEquals("Quantity not sufficient", source.get("rejectionReason").asString());
        assertEquals(visit.id().toString(), source.get("visitId").asString());
        assertEquals(order.id().toString(), source.get("orderId").asString());
        assertEquals(Set.of(order.items().get(0).id().toString(), order.items().get(1).id().toString()), attestationIds(source));

        var names = testNames(order.id());
        assertEquals(order.orderNumber(), names.orderNumber());
        assertEquals("Synthetic workflow profile", names.patientName());
        assertEquals(Set.of("Synthetic first test", "Synthetic free test"), Set.copyOf(names.tests().values()));
        assertEquals(names.tests().keySet(), attestationIds(source));

        var types = json.readTree(mvc.perform(bearer(get("/api/lab-tests/sample-types"), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertTrue(types.isArray());
        assertTrue(types.valueStream().anyMatch(type -> type.asString().equals("SYNTHETIC")));

        var replacementTime = LaboratoryInput.now().minusSeconds(30);
        var key = UUID.randomUUID().toString();
        var body = Map.<String, Object>of(
                "visitId", visit.id().toString(),
                "sampleType", " Serum ",
                "containerType", "  SST  ",
                "collectedAt", replacementTime.toString(),
                "replacesSampleId", received.id().toString());
        var saved = postSample(body, key, 201);
        assertNotEquals(received.id().toString(), saved.get("id").asString());
        assertNotEquals(received.barcode(), saved.get("barcode").asString());
        assertEquals("REGISTERED", saved.get("status").asString());
        assertEquals(received.id().toString(), saved.get("replacesSampleId").asString());
        assertEquals("Serum", saved.get("sampleType").asString());
        assertEquals("SST", saved.get("containerType").asString());
        assertEquals(replacementTime, Instant.parse(saved.get("collectedAt").asString()));
        assertTrue(saved.get("receivedAt").isNull());
        assertEquals(0, saved.get("attestations").size());

        var replay = postSample(body, key, 200);
        assertEquals(saved.get("id").asString(), replay.get("id").asString());

        var changed = new LinkedHashMap<>(body);
        changed.put("containerType", "EDTA");
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", key).contentType("application/json").content(json.writeValueAsString(changed))), 409, "IDEMPOTENCY_KEY_REUSED", null);

        var extra = new LinkedHashMap<>(body);
        extra.put("notes", "Drawn again after rejection");
        extra.put("orderItemIds", List.of(order.items().getFirst().id().toString()));
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content(json.writeValueAsString(extra))), 400, "INVALID_JSON", null);
        error(mvc.perform(bearer(post("/api/samples/" + saved.get("id").asString() + "/attestations"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"orderItemId\":\"" + order.items().getFirst().id() + "\"}")), 409, "SAMPLE_RELATIONSHIP_CONFLICT", null);

        var accepted = sampleService.receive(actor(Role.LAB_TECHNICIAN), saved.get("id").asString(), new SampleRequests.Revision(saved.get("version").asLong()));
        var linked = sampleService.attest(actor(Role.LAB_TECHNICIAN), accepted.id().toString(), new SampleRequests.Attest(order.items().getFirst().id().toString()));
        assertEquals(List.of(order.items().getFirst().id()), linked.attestations().stream().map(link -> link.orderItemId()).toList());
    }

    @Test
    void replacementRequiresTheRejectedSampleOnTheSameOrder() throws Exception {
        var order = create(own, first);
        var visit = arrive(order, null);
        var open = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Serum", "SST", null, null), List.of(UUID.randomUUID().toString())).sample();
        var collected = LaboratoryInput.now().minusSeconds(20).toString();
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content(replacement(visit.id(), open.id(), collected, "SST"))), 409, "SAMPLE_RELATIONSHIP_CONFLICT", null);

        var other = create(own, free);
        var otherVisit = arrive(other, null);
        var foreign = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(otherVisit.id().toString(), "Serum", "SST", null, null), List.of(UUID.randomUUID().toString())).sample();
        var rejectedForeign = sampleService.reject(actor(Role.LAB_TECHNICIAN), foreign.id().toString(), new SampleRequests.Reject(foreign.version(), "Quantity not sufficient"));
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content(replacement(visit.id(), rejectedForeign.id(), collected, "SST"))), 409, "SAMPLE_RELATIONSHIP_CONFLICT", null);

        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content(replacement(visit.id(), open.id(), LaboratoryInput.now().plusSeconds(120).toString(), "SST"))), 400, "VALIDATION_ERROR", "collectedAt");
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content("{\"visitId\":\"" + visit.id() + "\",\"sampleType\":\" \",\"containerType\":\"SST\",\"collectedAt\":\"" + collected + "\",\"replacesSampleId\":\"" + open.id() + "\"}")), 400, "VALIDATION_ERROR", "sampleType");
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content(replacement(visit.id(), open.id(), collected, "x".repeat(61)))), 400, "VALIDATION_ERROR", "containerType");
        error(mvc.perform(bearer(get("/api/samples/" + open.id()), Role.PATIENT)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(post("/api/samples"), Role.PATIENT).header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json").content(replacement(visit.id(), open.id(), collected, "SST"))), 403, "FORBIDDEN", null);
    }

    private String replacement(UUID visitId, UUID replacesSampleId, String collectedAt, String container) throws Exception {
        return json.writeValueAsString(Map.of(
                "visitId", visitId.toString(),
                "sampleType", "Serum",
                "containerType", container,
                "collectedAt", collectedAt,
                "replacesSampleId", replacesSampleId.toString()));
    }

    private JsonNode readSample(UUID id) throws Exception {
        return json.readTree(mvc.perform(bearer(get("/api/samples/" + id), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private JsonNode postSample(Map<String, Object> body, String key, int expected) throws Exception {
        return json.readTree(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN).header("Idempotency-Key", key).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().is(expected)).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private Set<String> attestationIds(JsonNode sample) {
        var ids = new LinkedHashSet<String>();
        sample.get("attestations").forEach(link -> ids.add(link.get("orderItemId").asString()));
        return ids;
    }

    private ListedOrder testNames(UUID orderId) throws Exception {
        var body = json.readTree(mvc.perform(bearer(get("/api/results/work-items").param("orderId", orderId.toString()), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        var names = new LinkedHashMap<String, String>();
        String orderNumber = "";
        String patientName = "";
        for (var item : body.get("content")) {
            if (orderNumber.isEmpty()) {
                orderNumber = item.get("orderNumber").asString();
                patientName = item.get("patientName").asString();
            }
            names.put(item.get("orderItemId").asString(), item.get("testName").asString());
        }
        return new ListedOrder(orderNumber, patientName, names);
    }

    private record ListedOrder(String orderNumber, String patientName, Map<String, String> tests) {
    }
}
