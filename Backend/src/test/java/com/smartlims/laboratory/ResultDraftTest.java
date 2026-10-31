package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.dto.TestParameterRequest;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.results.dto.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ResultDraftTest extends LaboratoryTestSupport {
    @Test
    void draftSnapshotsExistingCatalogParametersWithoutFollowingLaterChanges() {
        define(first.getId());
        var o = create(own, first);
        arrive(o, null);
        var r = draftService.create(actor(Role.LAB_TECHNICIAN), new ResultRequests.Create(o.items().getFirst().id().toString()), List.of(UUID.randomUUID().toString())).result();
        assertEquals(2, r.values().size());
        assertNull(r.values().getFirst().numericValue());
        assertEquals("synthetic-unit", r.values().getFirst().unit());
        parameterService.save(actor(Role.ADMIN), first.getId().toString(), null, new TestParameterRequest("NEW", "New synthetic", "TEXT", null, null, 2, true, true, null));
        var p = r.values().getFirst();
        parameterService.save(actor(Role.ADMIN), first.getId().toString(), p.parameterId().toString(), new TestParameterRequest(p.code(), p.name(), p.resultType().name(), p.unit(), p.method(), p.displayOrder(), p.required(), false, 0L));
        jdbc.update("UPDATE lab_tests SET name='Renamed synthetic catalog' WHERE id=?", first.getId());
        var stored = draftService.get(actor(Role.LAB_TECHNICIAN), r.id().toString());
        assertEquals(2, stored.values().size());
        assertEquals(o.items().getFirst().testName(), stored.testName());
        assertEquals(p, stored.values().getFirst());
    }

    @Test
    void measurementsRemainDecimalAndSuppliedFlagsReferencesAreNeverInterpreted() throws Exception {
        define(first.getId());
        var o = create(own, first);
        var v = arrive(o, null);
        var sample = received(v, o.items().getFirst().id());
        var r = draftService.create(actor(Role.LAB_TECHNICIAN), new ResultRequests.Create(o.items().getFirst().id().toString()), List.of(UUID.randomUUID().toString())).result();
        var body = contents(r, sample.id());
        var edited = draftService.edit(actor(Role.LAB_TECHNICIAN), r.id().toString(), body);
        assertEquals(0, new BigDecimal("1.25").compareTo(edited.values().getFirst().numericValue()));
        assertEquals("NOT_EVALUATED", edited.values().getFirst().flag().name());
        assertEquals("Explicitly supplied reference", edited.values().getFirst().referenceText());
        assertTrue(edited.version() > r.version());
        assertEquals("RESULT_CHANGED", assertThrows(LaboratoryException.class, () -> draftService.edit(actor(Role.LAB_TECHNICIAN), r.id().toString(), body)).getCode());
        String jsonBody = json.writeValueAsString(contents(edited, sample.id())).replace("\"numericValue\":1.25", "\"numericValue\":\"1.25\"");
        error(mvc.perform(bearer(put("/api/results/" + r.id()), Role.LAB_TECHNICIAN).contentType("application/json").content(jsonBody)), 400, "INVALID_JSON", null);
    }

    @Test
    void draftsNeedRealVisitedOrderAndDefinitionsAndOnlyTechniciansMayAuthor() throws Exception {
        var o = create(own, first);
        var body = new ResultRequests.Create(o.items().getFirst().id().toString());
        assertEquals("RESULT_STATE_CONFLICT", assertThrows(LaboratoryException.class, () -> draftService.create(actor(Role.LAB_TECHNICIAN), body, List.of(UUID.randomUUID().toString()))).getCode());
        arrive(o, null);
        assertEquals("RESULT_DEFINITIONS_UNAVAILABLE", assertThrows(LaboratoryException.class, () -> draftService.create(actor(Role.LAB_TECHNICIAN), body, List.of(UUID.randomUUID().toString()))).getCode());
        define(first.getId());
        error(mvc.perform(post("/api/results").header("Authorization", "Bearer " + reviewerToken).header("Idempotency-Key", UUID.randomUUID()).contentType("application/json").content(json.writeValueAsString(body))), 403, "FORBIDDEN", null);
        var r = draftService.create(actor(Role.LAB_TECHNICIAN), body, List.of(UUID.randomUUID().toString())).result();
        error(mvc.perform(bearer(get("/api/results/" + r.id()), Role.PATIENT)), 403, "FORBIDDEN", null);
    }

    @Test
    void concurrentDraftCreationAndValueOnlyEditsHaveSingleWinners() throws Exception {
        define(first.getId());
        var o = create(own, first);
        var v = arrive(o, null);
        var sample = received(v, o.items().getFirst().id());
        var body = new ResultRequests.Create(o.items().getFirst().id().toString());
        var key = List.of(UUID.randomUUID().toString());
        UUID id;
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            Callable<UUID> task = () -> {
                gate.await();
                return draftService.create(actor(Role.LAB_TECHNICIAN), body, key).result().id();
            };
            var a = pool.submit(task);
            var b = pool.submit(task);
            gate.countDown();
            id = a.get(15, TimeUnit.SECONDS);
            assertEquals(id, b.get(15, TimeUnit.SECONDS));
        }
        var r = draftService.get(actor(Role.LAB_TECHNICIAN), id.toString());
        r = draftService.edit(actor(Role.LAB_TECHNICIAN), id.toString(), contents(r, sample.id()));
        var stable = contents(r, sample.id());
        stable = new ResultRequests.Edit(r.version(), r.measuredAt().toString(), stable.specimenIds(), r.explanation(), stable.values());
        final var edit = stable;
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            Callable<String> task = () -> {
                gate.await();
                try {
                    draftService.edit(actor(Role.LAB_TECHNICIAN), id.toString(), edit);
                    return "EDITED";
                } catch (LaboratoryException e) {
                    return e.getCode();
                }
            };
            var a = pool.submit(task);
            var b = pool.submit(task);
            gate.countDown();
            var results = List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            assertEquals(1, Collections.frequency(results, "EDITED"));
            assertEquals(1, Collections.frequency(results, "RESULT_CHANGED"));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM test_results", Integer.class));
    }

    @Test
    void invalidCompleteValueSetAndRollbackLeaveOriginalDraftAndEventsUntouched() {
        define(first.getId());
        var o = create(own, first);
        var v = arrive(o, null);
        var sample = received(v, o.items().getFirst().id());
        var r = draftService.create(actor(Role.LAB_TECHNICIAN), new ResultRequests.Create(o.items().getFirst().id().toString()), List.of(UUID.randomUUID().toString())).result();
        var b = contents(r, sample.id());
        assertThrows(LaboratoryException.class, () -> draftService.edit(actor(Role.LAB_TECHNICIAN), r.id().toString(), new ResultRequests.Edit(r.version(), b.measuredAt(), b.specimenIds(), b.explanation(), List.of(b.values().getFirst()))));
        assertThrows(IllegalStateException.class, () -> new TransactionTemplate(transactionManager).execute(tx -> {
            draftService.edit(actor(Role.LAB_TECHNICIAN), r.id().toString(), b);
            throw new IllegalStateException("Synthetic rollback");
        }));
        assertEquals(r, draftService.get(actor(Role.LAB_TECHNICIAN), r.id().toString()));
    }
}
