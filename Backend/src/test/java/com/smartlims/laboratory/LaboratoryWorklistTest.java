package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.results.dto.ResultRequests;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.samples.dto.SampleRequests;

import java.math.BigDecimal;
import java.util.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LaboratoryWorklistTest extends LaboratoryTestSupport {
    private static final Map<String, Integer> SAMPLE_RANK = Map.of("RECEIVED", 3, "REGISTERED", 2, "REJECTED", 1);

    @Test
    void worklistFeedsOrderedReceivedAndPendingPublicationStates() throws Exception {
        var draft = prepared(create(own, first));
        var collected = collected(create(own, free));
        var received = receivedOnly(create(own, first));
        var approvedOrder = create(own, free);
        var approved = prepared(approvedOrder);
        var approvedResult = publicationService.approve(actor(reviewerId, Role.ADMIN), approved.result().id().toString(), new ResultRequests.Revision(approved.result().version()));
        var publishedTest = tests.saveAndFlush(new LabTest("P_SYN", "Synthetic published test", null, new BigDecimal("12.34"), "SYNTHETIC", null));
        var published = prepared(create(own, publishedTest));
        var publishedResult = publish(published.result());
        var rejected = rejected(create(own, free));
        var pending = create(own, first);
        var cancelled = create(own, free);
        state(cancelled.id(), "CANCELLED");

        var items = workItems();
        assertEquals(7, items.size());
        assertFalse(items.stream().anyMatch(item -> item.get("orderId").asString().equals(cancelled.id().toString())));

        assertRow(items, draft.result().orderId(), draft.result().orderItemId(), "Synthetic first test", "RECEIVED", "DRAFT", draft.result().id(), null);
        assertRow(items, collected.order().id(), collected.order().items().getFirst().id(), "Synthetic free test", "REGISTERED", null, null, null);
        assertRow(items, received.order().id(), received.order().items().getFirst().id(), "Synthetic first test", "RECEIVED", null, null, null);
        assertRow(items, approved.result().orderId(), approved.result().orderItemId(), "Synthetic free test", "RECEIVED", "APPROVED", approvedResult.id(), null);
        assertRow(items, published.result().orderId(), published.result().orderItemId(), "Synthetic published test", "RECEIVED", "PUBLISHED", null, publishedResult.id());
        assertRow(items, rejected.order().id(), rejected.order().items().getFirst().id(), "Synthetic free test", "REJECTED", null, null, null);
        assertRow(items, pending.id(), pending.items().getFirst().id(), "Synthetic first test", null, null, null, null);

        var samples = samplesFor(items);
        assertEquals(4, samples.stream().filter(sample -> "RECEIVED".equals(text(sample, "status"))).map(sample -> sample.get("id").asString()).distinct().count());
        assertEquals(1, items.stream().filter(item -> "APPROVED".equals(text(item, "workingState"))).count());
        assertEquals(1, received.samples().stream().filter(sample -> "REGISTERED".equals(sample.get("status").asString())).count());
        assertTrue(items.stream().allMatch(item -> "Synthetic workflow profile".equals(item.get("patientName").asString()) && item.get("orderNumber").asString().startsWith("ORD-")));
    }

    @Test
    void worklistReadsStayOnLaboratoryStaffAndRejectUnknownSelectors() throws Exception {
        var order = create(own, first);
        workItems();
        mvc.perform(get("/api/results/work-items").header("Authorization", "Bearer " + reviewerToken))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        error(mvc.perform(bearer(get("/api/results/work-items"), Role.ADMIN)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/results/work-items"), Role.PATIENT)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/results/work-items"), Role.RECEPTIONIST)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/results/work-items").param("status", "DRAFT"), Role.LAB_TECHNICIAN)), 400, "VALIDATION_ERROR", "status");
        error(mvc.perform(bearer(get("/api/samples"), Role.LAB_TECHNICIAN)), 400, "VALIDATION_ERROR", "orderId");
        error(mvc.perform(bearer(get("/api/samples").param("orderId", UUID.randomUUID().toString()), Role.LAB_TECHNICIAN)), 404, "ORDER_NOT_FOUND", null);
        mvc.perform(bearer(get("/api/samples").param("orderId", order.id().toString()), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());
    }

    private Collected collected(OrderDetailResponse order) {
        var visit = arrive(order, null);
        var sample = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Blood", "EDTA", LaboratoryInput.now().minusSeconds(30).toString(), null), List.of(UUID.randomUUID().toString())).sample();
        assertEquals("REGISTERED", sample.status().name());
        assertTrue(sample.attestations().isEmpty());
        return new Collected(order);
    }

    private Received receivedOnly(OrderDetailResponse order) throws Exception {
        var visit = arrive(order, null);
        var attested = received(visit, order.items().getFirst().id());
        var extra = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Serum", null, null, null), List.of(UUID.randomUUID().toString())).sample();
        var listed = samples(order.id());
        assertEquals(Set.of(attested.id().toString(), extra.id().toString()), ids(listed));
        return new Received(order, listed);
    }

    private Collected rejected(OrderDetailResponse order) {
        var visit = arrive(order, null);
        var sample = received(visit, order.items().getFirst().id());
        var rejected = sampleService.reject(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Reject(sample.version(), "Quantity not sufficient"));
        assertEquals("REJECTED", rejected.status().name());
        return new Collected(order);
    }

    private List<JsonNode> workItems() throws Exception {
        var response = mvc.perform(bearer(get("/api/results/work-items").param("page", "0").param("size", "100"), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        var body = json.readTree(response.getContentAsByteArray());
        assertEquals(0, body.get("page").asInt());
        assertTrue(body.get("last").asBoolean());
        assertEquals(body.get("content").size(), body.get("totalElements").asInt());
        var items = new ArrayList<JsonNode>();
        body.get("content").forEach(items::add);
        return items;
    }

    private List<JsonNode> samplesFor(List<JsonNode> items) throws Exception {
        var samples = new ArrayList<JsonNode>();
        var seen = new HashSet<String>();
        for (var item : items) {
            var orderId = item.get("orderId").asString();
            if (seen.add(orderId))
                samples.addAll(samples(UUID.fromString(orderId)));
        }
        return samples;
    }

    private List<JsonNode> samples(UUID orderId) throws Exception {
        var response = mvc.perform(bearer(get("/api/samples").param("orderId", orderId.toString()).param("size", "100"), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        var body = json.readTree(response.getContentAsByteArray());
        assertTrue(body.get("last").asBoolean());
        var samples = new ArrayList<JsonNode>();
        body.get("content").forEach(samples::add);
        return samples;
    }

    private void assertRow(List<JsonNode> items, UUID orderId, UUID itemId, String testName, String sampleStatus, String resultStatus, UUID workingResultId, UUID currentResultId) throws Exception {
        var item = items.stream().filter(row -> row.get("orderItemId").asString().equals(itemId.toString())).findFirst().orElseThrow();
        assertEquals(orderId.toString(), item.get("orderId").asString());
        assertEquals(testName, item.get("testName").asString());
        assertEquals(sampleStatus, sampleStatus(item, samples(orderId)));
        assertEquals(resultStatus, resultStatus(item));
        assertEquals(workingResultId == null ? null : workingResultId.toString(), text(item, "workingResultId"));
        assertEquals(currentResultId == null ? null : currentResultId.toString(), text(item, "currentResultId"));
        assertEquals("DRAFT".equals(resultStatus) && workingResultId != null, "DRAFT".equals(text(item, "workingState")) && text(item, "workingResultId") != null);
    }

    private String sampleStatus(JsonNode item, List<JsonNode> samples) {
        var onOrder = samples.stream().filter(sample -> item.get("orderId").asString().equals(sample.get("orderId").asString())).toList();
        var attested = onOrder.stream().filter(sample -> attestation(sample, item.get("orderItemId").asString())).toList();
        if (!attested.isEmpty())
            return preferred(attested);
        var unlinked = onOrder.stream().filter(sample -> sample.get("attestations").isEmpty()).toList();
        return unlinked.isEmpty() ? null : preferred(unlinked);
    }

    private boolean attestation(JsonNode sample, String orderItemId) {
        for (var link : sample.get("attestations"))
            if (orderItemId.equals(link.get("orderItemId").asString()))
                return true;
        return false;
    }

    private String preferred(List<JsonNode> samples) {
        return samples.stream().max(Comparator.comparingInt(sample -> SAMPLE_RANK.getOrDefault(sample.get("status").asString(), 0))).orElseThrow().get("status").asString();
    }

    private String resultStatus(JsonNode item) {
        var working = text(item, "workingState");
        if ("DRAFT".equals(working) || "APPROVED".equals(working))
            return working;
        return text(item, "currentResultId") == null ? null : "PUBLISHED";
    }

    private String text(JsonNode node, String field) {
        var value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private Set<String> ids(List<JsonNode> samples) {
        var ids = new HashSet<String>();
        samples.forEach(sample -> ids.add(sample.get("id").asString()));
        return ids;
    }

    private record Collected(OrderDetailResponse order) {
    }

    private record Received(OrderDetailResponse order, List<JsonNode> samples) {
    }
}
