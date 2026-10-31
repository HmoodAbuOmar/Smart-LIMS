package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.samples.dto.SampleRequests;

import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SampleWorkflowTest extends LaboratoryTestSupport {
    @Test
    void receiptAndSuitabilityAreExplicitSameOrderEventsAndCollectionRemainsSeparate() throws Exception {
        var o = create(own, first);
        var v = arrive(o, null);
        var s = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(v.id().toString(), "SYNTHETIC", null, LaboratoryInput.now().minusSeconds(100).toString(), null), List.of(UUID.randomUUID().toString())).sample();
        assertEquals("REGISTERED", s.status().name());
        assertNull(s.receivedAt());
        assertTrue(s.attestations().isEmpty());
        assertTrue(s.collectedAt().isBefore(v.arrivedAt()));
        var received = sampleService.receive(actor(Role.LAB_TECHNICIAN), s.id().toString(), new SampleRequests.Revision(0L));
        assertEquals("RECEIVED", received.status().name());
        assertEquals(s.collectedAt(), received.collectedAt());
        assertNotEquals(received.collectedAt(), received.receivedAt());
        var attested = sampleService.attest(actor(reviewerId, Role.ADMIN), s.id().toString(), new SampleRequests.Attest(o.items().getFirst().id().toString()));
        assertEquals(1, attested.attestations().size());
        assertEquals(reviewerId, attested.attestations().getFirst().attestedBy());
        assertEquals(attested, sampleService.attest(actor(Role.LAB_TECHNICIAN), s.id().toString(), new SampleRequests.Attest(o.items().getFirst().id().toString())));
        mvc.perform(bearer(get("/api/visits/me/" + v.id()), Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.specimens[0].id").value(s.id().toString()));
        error(mvc.perform(bearer(get("/api/samples/" + s.id()), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    @Test
    void staffAuthorityAndCrossOrderAttestationAndReplacementAreEnforced() throws Exception {
        var o = create(own, first);
        var v = arrive(o, null);
        var s = received(v, o.items().getFirst().id());
        var otherOrder = create(other, first);
        var otherVisit = arrive(otherOrder, null);
        assertEquals("SAMPLE_RELATIONSHIP_CONFLICT", assertThrows(LaboratoryException.class, () -> sampleService.attest(actor(Role.LAB_TECHNICIAN), s.id().toString(), new SampleRequests.Attest(otherOrder.items().getFirst().id().toString()))).getCode());
        assertThrows(LaboratoryException.class, () -> sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(otherVisit.id().toString(), "SYNTHETIC", null, null, s.id().toString()), List.of(UUID.randomUUID().toString())));
        error(mvc.perform(bearer(get("/api/samples/" + s.id()), Role.ADMIN)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(post("/api/samples"), Role.RECEPTIONIST).contentType("application/json").content("{}")), 403, "FORBIDDEN", null);
    }

    @Test
    void rejectionRequiresReasonRetainsReceiptAndReplacementHistory() throws Exception {
        var o = create(own, first);
        var v = arrive(o, null);
        var s = received(v, o.items().getFirst().id());
        error(mvc.perform(bearer(post("/api/samples/" + s.id() + "/reject"), Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":1,\"reason\":\" \"}")), 400, "VALIDATION_ERROR", "reason");
        var rejected = sampleService.reject(actor(Role.LAB_TECHNICIAN), s.id().toString(), new SampleRequests.Reject(1L, " Synthetic rejection "));
        assertEquals(s.receivedAt(), rejected.receivedAt());
        assertEquals("Synthetic rejection", rejected.rejectionReason());
        assertEquals(rejected, sampleService.reject(actor(reviewerId, Role.ADMIN), s.id().toString(), new SampleRequests.Reject(1L, "Another reason")));
        assertThrows(LaboratoryException.class, () -> sampleService.receive(actor(Role.LAB_TECHNICIAN), s.id().toString(), new SampleRequests.Revision(rejected.version())));
        var replacement = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(v.id().toString(), "SYNTHETIC", null, null, s.id().toString()), List.of(UUID.randomUUID().toString())).sample();
        assertEquals(s.id(), replacement.replacesSampleId());
        assertNotEquals(s.barcode(), replacement.barcode());
        assertTrue(replacement.attestations().isEmpty());
        assertEquals("REGISTERED", replacement.status().name());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM samples", Integer.class));
        assertEquals(4, rejected.events().size());
    }

    @Test
    void creationRetryAndConcurrentReceiptRetainSingleOriginalRecord() throws Exception {
        var o = create(own, first);
        var v = arrive(o, null);
        var body = new SampleRequests.Create(v.id().toString(), "SYNTHETIC", null, null, null);
        var key = List.of(UUID.randomUUID().toString());
        var sample = sampleService.create(actor(Role.LAB_TECHNICIAN), body, key).sample();
        assertEquals(sample, sampleService.create(actor(Role.LAB_TECHNICIAN), body, key).sample());
        assertEquals("IDEMPOTENCY_KEY_REUSED", assertThrows(LaboratoryException.class, () -> sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(v.id().toString(), "Different", null, null, null), key)).getCode());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var a = pool.submit(() -> {
                gate.await();
                return sampleService.receive(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Revision(0L));
            });
            var b = pool.submit(() -> {
                gate.await();
                return sampleService.receive(actor(reviewerId, Role.ADMIN), sample.id().toString(), new SampleRequests.Revision(0L));
            });
            gate.countDown();
            assertEquals(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM samples", Integer.class));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM laboratory_events WHERE sample_id=?", Integer.class, sample.id()));
    }

    @Test
    void receiptAndAttestationRollbackTogetherAndFutureCollectionsAreRejected() {
        var o = create(own, first);
        var v = arrive(o, null);
        var sample = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(v.id().toString(), "SYNTHETIC", null, null, null), List.of(UUID.randomUUID().toString())).sample();
        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactionManager).execute(tx -> {
            sampleService.receive(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Revision(0L));
            sampleService.attest(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Attest(o.items().getFirst().id().toString()));
            throw new IllegalStateException("Synthetic rollback");
        }));
        assertEquals("REGISTERED", sampleService.get(actor(Role.LAB_TECHNICIAN), sample.id().toString()).status().name());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM specimen_attestations", Integer.class));
        assertThrows(LaboratoryException.class, () -> sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(v.id().toString(), "SYNTHETIC", null, LaboratoryInput.now().plusSeconds(60).toString(), null), List.of(UUID.randomUUID().toString())));
    }
}
