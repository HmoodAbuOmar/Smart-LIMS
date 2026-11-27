package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.results.dto.ResultRequests;
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

class LaboratoryRejectionTest extends LaboratoryTestSupport {
    @Test
    void rejectionScreenConfirmsTheSamplePatientAndOrderThenStoresTheReason() throws Exception {
        var order = create(own, first);
        var visit = arrive(order, null);
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Blood", "EDTA", LaboratoryInput.now().minusSeconds(90).toString(), null), List.of(UUID.randomUUID().toString())).sample();
        var received = sampleService.receive(actor(Role.LAB_TECHNICIAN), created.id().toString(), new SampleRequests.Revision(created.version()));
        var item = workItem(order.id());
        var sample = readSample(received.id());

        assertEquals(received.barcode(), sample.get("barcode").asString());
        assertEquals(order.orderNumber(), item.get("orderNumber").asString());
        assertEquals("Synthetic workflow profile", item.get("patientName").asString());
        assertEquals(received.version(), sample.get("version").asLong());

        var rejected = reject(received.id(), sample.get("version").asLong(), " Quantity not sufficient ");
        assertEquals(received.id().toString(), rejected.get("id").asString());
        assertEquals(received.barcode(), rejected.get("barcode").asString());
        assertEquals("REJECTED", rejected.get("status").asString());
        assertEquals("Quantity not sufficient", rejected.get("rejectionReason").asString());
        assertEquals(received.collectedAt(), Instant.parse(rejected.get("collectedAt").asString()));
        assertEquals(received.receivedAt(), Instant.parse(rejected.get("receivedAt").asString()));

        var repeated = reject(received.id(), sample.get("version").asLong(), "A different reason");
        assertEquals("REJECTED", repeated.get("status").asString());
        assertEquals("Quantity not sufficient", repeated.get("rejectionReason").asString());
    }

    @Test
    void blankStaleInUseAndUnauthorizedRejectionAreRejected() throws Exception {
        var order = create(own, first);
        var visit = arrive(order, null);
        var created = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), "Blood", "EDTA", null, null), List.of(UUID.randomUUID().toString())).sample();
        error(mvc.perform(bearer(post("/api/samples/" + created.id() + "/reject"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":0,\"reason\":\" \"}")), 400, "VALIDATION_ERROR", "reason");
        error(mvc.perform(bearer(post("/api/samples/" + created.id() + "/reject"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":0,\"reason\":\"" + "x".repeat(1001) + "\"}")), 400, "VALIDATION_ERROR", "reason");
        error(mvc.perform(bearer(post("/api/samples/" + created.id() + "/reject"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":4,\"reason\":\"Hemolyzed\"}")), 409, "SAMPLE_CHANGED", null);
        error(mvc.perform(bearer(post("/api/samples/" + created.id() + "/reject"), Role.PATIENT).contentType("application/json").content("{\"expectedVersion\":0,\"reason\":\"Hemolyzed\"}")), 403, "FORBIDDEN", null);

        var prepared = prepared(create(own, free));
        publicationService.approve(actor(reviewerId, Role.ADMIN), prepared.result().id().toString(), new ResultRequests.Revision(prepared.result().version()));
        error(mvc.perform(bearer(post("/api/samples/" + prepared.sample().id() + "/reject"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":" + prepared.sample().version() + ",\"reason\":\"Quantity not sufficient\"}")), 409, "SAMPLE_IN_USE", null);
    }

    private JsonNode workItem(UUID orderId) throws Exception {
        var body = json.readTree(mvc.perform(bearer(get("/api/results/work-items").param("orderId", orderId.toString()), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        return body.get("content").get(0);
    }

    private JsonNode readSample(UUID id) throws Exception {
        return json.readTree(mvc.perform(bearer(get("/api/samples/" + id), Role.LAB_TECHNICIAN))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }

    private JsonNode reject(UUID id, long version, String reason) throws Exception {
        var body = json.writeValueAsString(Map.of("expectedVersion", version, "reason", reason));
        return json.readTree(mvc.perform(bearer(post("/api/samples/" + id + "/reject"), Role.LAB_TECHNICIAN).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
    }
}
