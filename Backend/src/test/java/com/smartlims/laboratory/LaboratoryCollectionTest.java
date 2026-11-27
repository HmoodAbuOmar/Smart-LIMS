package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;

import java.time.Instant;
import java.util.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LaboratoryCollectionTest extends LaboratoryTestSupport {
    @Test
    void collectionFormListsTheOrderPatientTestsAndSampleTypesThenRecordsTheSpecimen() throws Exception {
        var pending = create(own, first);
        var order = create(own, first, free);
        var visit = arrive(order, null);
        var collectedAt = LaboratoryInput.now().minusSeconds(60).toString();

        var orders = collectionOrders(workItems());
        assertFalse(orders.stream().anyMatch(row -> row.orderId().equals(pending.id().toString())));
        var listed = orders.stream().filter(row -> row.orderId().equals(order.id().toString())).findFirst().orElseThrow();
        assertEquals(order.orderNumber(), listed.orderNumber());
        assertEquals("Synthetic workflow profile", listed.patientName());
        assertEquals(Set.of("Synthetic first test", "Synthetic free test"), listed.tests());

        mvc.perform(bearer(get("/api/lab-tests/sample-types"), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$[0]").value("SYNTHETIC"));

        var body = json.writeValueAsString(Map.of(
                "visitId", visit.id().toString(),
                "sampleType", "SYNTHETIC",
                "containerType", "EDTA",
                "collectedAt", collectedAt));
        var saved = json.readTree(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN)
                        .contentType("application/json").header("Idempotency-Key", UUID.randomUUID().toString()).content(body))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertEquals("REGISTERED", saved.get("status").asString());
        assertEquals("SYNTHETIC", saved.get("sampleType").asString());
        assertEquals("EDTA", saved.get("containerType").asString());
        assertEquals(Instant.parse(collectedAt), Instant.parse(saved.get("collectedAt").asString()));
        assertTrue(saved.get("receivedAt").isNull());
        assertEquals(order.id().toString(), saved.get("orderId").asString());
        assertEquals(visit.id().toString(), saved.get("visitId").asString());
        assertTrue(saved.get("attestations").isEmpty());

        var withNotes = json.writeValueAsString(Map.of(
                "visitId", visit.id().toString(),
                "sampleType", "SYNTHETIC",
                "containerType", "EDTA",
                "collectedAt", collectedAt,
                "notes", "Fasting not confirmed",
                "orderItemIds", List.of(order.items().getFirst().id().toString())));
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN)
                .contentType("application/json").header("Idempotency-Key", UUID.randomUUID().toString()).content(withNotes)), 400, "INVALID_JSON", null);
        error(mvc.perform(bearer(post("/api/samples/" + saved.get("id").asString() + "/attestations"), Role.LAB_TECHNICIAN)
                .contentType("application/json").content("{\"orderItemId\":\"" + order.items().getFirst().id() + "\"}")), 409, "SAMPLE_RELATIONSHIP_CONFLICT", null);

        var received = json.readTree(mvc.perform(bearer(post("/api/samples/" + saved.get("id").asString() + "/receive"), Role.LAB_TECHNICIAN)
                        .contentType("application/json").content("{\"expectedVersion\":" + saved.get("version").asLong() + "}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        assertEquals("RECEIVED", received.get("status").asString());
        var linked = json.readTree(mvc.perform(bearer(post("/api/samples/" + saved.get("id").asString() + "/attestations"), Role.LAB_TECHNICIAN)
                        .contentType("application/json").content("{\"orderItemId\":\"" + order.items().getFirst().id() + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        assertEquals(order.items().getFirst().id().toString(), linked.get("attestations").get(0).get("orderItemId").asString());
    }

    @Test
    void futureCollectionAndNonLaboratoryRolesCannotRecordASpecimen() throws Exception {
        var order = create(own, first);
        var visit = arrive(order, null);
        var future = LaboratoryInput.now().plusSeconds(120).toString();
        var body = json.writeValueAsString(Map.of(
                "visitId", visit.id().toString(),
                "sampleType", "SYNTHETIC",
                "containerType", "EDTA",
                "collectedAt", future));
        error(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN)
                .contentType("application/json").header("Idempotency-Key", UUID.randomUUID().toString()).content(body)), 400, "VALIDATION_ERROR", "collectedAt");
        error(mvc.perform(bearer(post("/api/samples"), Role.PATIENT)
                .contentType("application/json").header("Idempotency-Key", UUID.randomUUID().toString()).content(body)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/lab-tests/sample-types"), Role.PATIENT)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/results/work-items"), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    private List<ListedOrder> collectionOrders(List<JsonNode> items) {
        var orders = new LinkedHashMap<String, ListedOrder>();
        for (var item : items) {
            var status = text(item, "orderStatus");
            if (status != null && !status.equals("IN_PROGRESS") && !status.equals("COMPLETED"))
                continue;
            var orderId = item.get("orderId").asString();
            var order = orders.computeIfAbsent(orderId, id -> new ListedOrder(id, item.get("orderNumber").asString(), item.get("patientName").asString(), new LinkedHashSet<>()));
            order.tests().add(item.get("testName").asString());
        }
        return List.copyOf(orders.values());
    }

    private List<JsonNode> workItems() throws Exception {
        var body = json.readTree(mvc.perform(bearer(get("/api/results/work-items").param("size", "100"), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        var items = new ArrayList<JsonNode>();
        body.get("content").forEach(items::add);
        return items;
    }

    private String text(JsonNode node, String field) {
        var value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private record ListedOrder(String orderId, String orderNumber, String patientName, Set<String> tests) {
    }
}
