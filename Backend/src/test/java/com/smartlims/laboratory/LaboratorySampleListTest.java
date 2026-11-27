package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.samples.dto.SampleRequests;
import com.smartlims.visits.dto.VisitResponse;

import java.time.Instant;
import java.util.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LaboratorySampleListTest extends LaboratoryTestSupport {
    @Test
    void sampleListFeedsBarcodeOrderPatientTypeStatusAndTimes() throws Exception {
        var received = collected(create(own, first), "Blood", "EDTA", true);
        var registered = collected(create(own, free), "Blood", "Fluoride", false);
        var rejectedOrder = create(own, first);
        var rejected = collected(rejectedOrder, "Serum", "Gel tube", true);
        sampleService.reject(actor(Role.LAB_TECHNICIAN), rejected.sample().id().toString(), new SampleRequests.Reject(rejected.sample().version(), "Quantity not sufficient"));
        var cancelled = collected(create(own, free), "Blood", "EDTA", false);
        state(cancelled.order().id(), "CANCELLED");

        var rows = sampleList();
        assertEquals(3, rows.size());
        assertFalse(rows.stream().anyMatch(row -> row.barcode().equals(cancelled.sample().barcode())));

        var receivedRow = row(rows, received.sample().id());
        assertEquals(received.order().orderNumber() + " · Synthetic workflow profile", orderPatient(receivedRow));
        assertEquals("Blood / EDTA", typeContainer(receivedRow));
        assertEquals("RECEIVED", receivedRow.status());
        assertTrue(Instant.parse(receivedRow.collectedAt()).isBefore(Instant.parse(receivedRow.receivedAt())));
        assertEquals("reject", action(receivedRow));

        var collectedRow = row(rows, registered.sample().id());
        assertEquals(registered.order().orderNumber() + " · Synthetic workflow profile", orderPatient(collectedRow));
        assertEquals("Blood / Fluoride", typeContainer(collectedRow));
        assertEquals("REGISTERED", collectedRow.status());
        assertNotNull(collectedRow.collectedAt());
        assertNull(collectedRow.receivedAt());
        assertEquals("reject", action(collectedRow));

        var rejectedRow = row(rows, rejected.sample().id());
        assertEquals("Serum / Gel tube", typeContainer(rejectedRow));
        assertEquals("REJECTED", rejectedRow.status());
        assertNotNull(rejectedRow.collectedAt());
        assertNotNull(rejectedRow.receivedAt());
        assertEquals("replace", action(rejectedRow));
        assertTrue(rows.stream().allMatch(row -> row.barcode().startsWith("SMP-") && row.orderNumber().startsWith("ORD-") && row.version() >= 0));

        var detail = json.readTree(mvc.perform(bearer(get("/api/samples/" + received.sample().id()), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertEquals(receivedRow.barcode(), detail.get("barcode").asString());
        assertEquals(receivedRow.status(), detail.get("status").asString());
        assertEquals(receivedRow.version(), detail.get("version").asLong());
        assertEquals(received.order().id().toString(), detail.get("orderId").asString());
    }

    @Test
    void rejectAndReplacementUpdateTheSameSampleList() throws Exception {
        var source = collected(create(own, first), "Blood", "EDTA", true);
        var before = row(sampleList(), source.sample().id());
        assertEquals("reject", action(before));

        var rejected = json.readTree(mvc.perform(bearer(post("/api/samples/" + before.id() + "/reject"), Role.LAB_TECHNICIAN)
                        .contentType("application/json")
                        .content("{\"expectedVersion\":" + before.version() + ",\"reason\":\"Quantity not sufficient\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertEquals(before.id(), rejected.get("id").asString());
        assertEquals("REJECTED", rejected.get("status").asString());
        assertEquals(before.collectedAt(), rejected.get("collectedAt").asString());
        assertEquals(before.receivedAt(), rejected.get("receivedAt").asString());

        var collectedAt = LaboratoryInput.now().minusSeconds(20).toString();
        var body = json.writeValueAsString(Map.of(
                "visitId", rejected.get("visitId").asString(),
                "sampleType", "Serum",
                "containerType", "Gel tube",
                "collectedAt", collectedAt,
                "replacesSampleId", before.id()));
        var replacement = json.readTree(mvc.perform(bearer(post("/api/samples"), Role.LAB_TECHNICIAN)
                        .contentType("application/json").header("Idempotency-Key", UUID.randomUUID().toString()).content(body))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertEquals(before.id(), replacement.get("replacesSampleId").asString());
        assertEquals("REGISTERED", replacement.get("status").asString());
        assertNotEquals(before.barcode(), replacement.get("barcode").asString());

        var rows = sampleList();
        assertEquals("replace", action(row(rows, UUID.fromString(before.id()))));
        var successor = row(rows, UUID.fromString(replacement.get("id").asString()));
        assertEquals("Serum / Gel tube", typeContainer(successor));
        assertEquals("reject", action(successor));
        assertEquals(successor.barcode(), replacementBarcode(rows, before.id()));

        error(mvc.perform(bearer(get("/api/samples").param("orderId", source.order().id().toString()), Role.PATIENT)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/samples").param("orderId", source.order().id().toString()), Role.RECEPTIONIST)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/samples").param("orderId", source.order().id().toString()), Role.ADMIN)), 403, "FORBIDDEN", null);
        mvc.perform(get("/api/samples").param("orderId", source.order().id().toString()).header("Authorization", "Bearer " + reviewerToken))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
    }

    private String replacementBarcode(List<Row> rows, String rejectedId) {
        return rows.stream().filter(row -> rejectedId.equals(row.replacesSampleId())).map(Row::barcode).findFirst().orElse("");
    }

    private Held collected(OrderDetailResponse order, String type, String container, boolean receive) {
        VisitResponse visit = arrive(order, null);
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), type, container, LaboratoryInput.now().minusSeconds(90).toString(), null), List.of(UUID.randomUUID().toString())).sample();
        var sample = receive ? sampleService.receive(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Revision(created.version())) : created;
        return new Held(order, sample);
    }

    private List<Row> sampleList() throws Exception {
        var orders = new LinkedHashMap<String, JsonNode>();
        for (var item : workItems())
            orders.putIfAbsent(item.get("orderId").asString(), item);
        var rows = new ArrayList<Row>();
        for (var order : orders.values()) {
            for (var sample : samples(UUID.fromString(order.get("orderId").asString())))
                rows.add(new Row(sample.get("id").asString(), sample.get("barcode").asString(), sample.get("orderId").asString(), order.get("orderNumber").asString(), order.get("patientName").asString(), text(sample, "sampleType"), text(sample, "containerType"), sample.get("status").asString(), text(sample, "collectedAt"), text(sample, "receivedAt"), sample.get("version").asLong(), text(sample, "replacesSampleId")));
        }
        return rows;
    }

    private List<JsonNode> workItems() throws Exception {
        var body = json.readTree(mvc.perform(bearer(get("/api/results/work-items").param("page", "0").param("size", "100"), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertTrue(body.get("last").asBoolean());
        var items = new ArrayList<JsonNode>();
        body.get("content").forEach(items::add);
        return items;
    }

    private List<JsonNode> samples(UUID orderId) throws Exception {
        var body = json.readTree(mvc.perform(bearer(get("/api/samples").param("orderId", orderId.toString()).param("size", "100"), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        assertTrue(body.get("last").asBoolean());
        var samples = new ArrayList<JsonNode>();
        body.get("content").forEach(samples::add);
        return samples;
    }

    private Row row(List<Row> rows, UUID id) {
        return rows.stream().filter(row -> row.id().equals(id.toString())).findFirst().orElseThrow();
    }

    private String orderPatient(Row row) {
        if (!row.orderNumber().isBlank() && !row.patientName().isBlank())
            return row.orderNumber() + " · " + row.patientName();
        return row.orderNumber().isBlank() ? row.patientName() : row.orderNumber();
    }

    private String typeContainer(Row row) {
        if (row.sampleType() != null && row.containerType() != null)
            return row.sampleType() + " / " + row.containerType();
        return row.sampleType() != null ? row.sampleType() : row.containerType() == null ? "" : row.containerType();
    }

    private String action(Row row) {
        if ("REJECTED".equals(row.status()))
            return "replace";
        if ("REGISTERED".equals(row.status()) || "RECEIVED".equals(row.status()))
            return "reject";
        return "open";
    }

    private String text(JsonNode node, String field) {
        var value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private record Held(OrderDetailResponse order, com.smartlims.samples.dto.SampleResponse sample) {
    }

    private record Row(String id, String barcode, String orderId, String orderNumber, String patientName, String sampleType,
                       String containerType, String status, String collectedAt, String receivedAt, long version,
                       String replacesSampleId) {
    }
}
