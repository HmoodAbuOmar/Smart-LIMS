package com.smartlims.orders;

import com.smartlims.auth.entity.Role;
import com.smartlims.orders.dto.*;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.service.OrderCancellationService;
import com.smartlims.patients.entity.Patient;
import jakarta.servlet.http.Cookie;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OrderCancellationTest extends OrderWorkflowTestSupport {
    @Autowired
    OrderCancellationService cancellations;

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder cancel(Role role, UUID id, String body) {
        return bearer(post("/api/orders/" + id + "/cancel").contentType(MediaType.APPLICATION_JSON).content(body), role);
    }

    private Map<String, Object> stored(UUID id) {
        return jdbc.queryForMap("SELECT * FROM test_orders WHERE id=?", id);
    }

    private List<String> items(UUID id) {
        return jdbc.queryForList("SELECT row_to_json(i)::text FROM order_items i WHERE order_id=? ORDER BY id", String.class, id);
    }

    private OrderDetailResponse response(org.springframework.test.web.servlet.MvcResult result) {
        return json.readValue(result.getResponse().getContentAsByteArray(), OrderDetailResponse.class);
    }

    @Test
    void patientCancellationRetainsEveryOriginalItemAndRecordsServerMetadataWithOptionalReasons() throws Exception {
        for (String body : List.of("{}", "{\"reason\":null}", "{\"reason\":\"\"}", "{\"reason\":\" \\t\\n \"}",
                "{\"reason\":\" Synthetic request \"}")) {
            var initial = create(own, first, free);
            var before = stored(initial.id());
            var oldItems = items(initial.id());
            Instant started = Instant.now();
            var result = mvc.perform(cancel(Role.PATIENT, initial.id(), body)).andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "no-store")).andExpect(header().doesNotExist("Location"))
                    .andExpect(jsonPath("$.status").value("CANCELLED")).andExpect(jsonPath("$.canCancel").value(false)).andReturn();
            var cancelled = response(result);
            assertEquals(initial.items(), cancelled.items());
            assertEquals(initial.totalAmount(), cancelled.totalAmount());
            assertEquals(2, cancelled.testCount());
            assertEquals(initial.id(), cancelled.id());
            assertEquals(initial.orderNumber(), cancelled.orderNumber());
            assertEquals(initial.createdAt(), cancelled.createdAt());
            assertFalse(cancelled.visitDetailsAvailable());
            assertFalse(cancelled.cancelledAt().isBefore(started.minusMillis(1)));
            assertFalse(cancelled.cancelledAt().isAfter(Instant.now()));
            assertFalse(cancelled.updatedAt().isBefore(cancelled.cancelledAt()),
                    () -> "updatedAt=" + cancelled.updatedAt() + ", cancelledAt=" + cancelled.cancelledAt());
            assertEquals(body.contains("Synthetic request") ? "Synthetic request" : null, cancelled.cancellationReason());
            assertEquals(actors.get(Role.PATIENT).getId(), stored(initial.id()).get("cancelled_by"));
            for (String immutable : List.of("patient_id", "created_by", "idempotency_key", "request_hash", "currency", "created_at"))
                assertEquals(before.get(immutable), stored(initial.id()).get(immutable));
            assertEquals(oldItems, items(initial.id()));
            assertFalse(json.readTree(result.getResponse().getContentAsByteArray()).has("cancelledBy"));
        }
        verifyNoInteractions(email);
    }

    @Test
    void bothStaffRolesCancelLinkedOtherAndUnlinkedProfilesWithTrimmedReasons() throws Exception {
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST))
            for (Patient target : List.of(own, other, unlinked)) {
                var initial = create(target, first);
                var result = response(mvc.perform(cancel(role, initial.id(), "{\"reason\":\" Synthetic staff request \"}"))
                        .andExpect(status().isOk()).andReturn());
                assertEquals("Synthetic staff request", result.cancellationReason());
                assertEquals(actors.get(role).getId(), stored(initial.id()).get("cancelled_by"));
                assertEquals(initial.items(), result.items());
            }
    }

    @Test
    void onlyPendingOrdersCanBeNewlyCancelledAndRejectedStatesLeaveEverythingUnchanged() throws Exception {
        for (String state : List.of("IN_PROGRESS", "COMPLETED")) {
            var initial = create(own, first, free);
            state(initial.id(), state);
            var before = stored(initial.id());
            var beforeItems = items(initial.id());
            for (Role role : List.of(Role.PATIENT, Role.ADMIN, Role.RECEPTIONIST)) {
                var result = mvc.perform(cancel(role, initial.id(), "{\"reason\":\"Synthetic reason\"}"));
                error(result, 409, "ORDER_NOT_CANCELLABLE", null);
                result.andExpect(jsonPath("$.message").value("Only pending orders can be cancelled."));
                assertEquals(before, stored(initial.id()));
                assertEquals(beforeItems, items(initial.id()));
            }
        }
    }

    @Test
    void missingUnlinkedAndUnownedOrdersAlwaysReturnTheSame404BeforeDisclosingState() throws Exception {
        for (Patient target : List.of(other, unlinked))
            for (String state : List.of("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED")) {
                var hidden = create(target, first);
                state(hidden.id(), state);
                var before = stored(hidden.id());
                var result = mvc.perform(cancel(Role.PATIENT, hidden.id(), "{}"));
                error(result, 404, "ORDER_NOT_FOUND", null);
                result.andExpect(jsonPath("$.message").value("Order not found."));
                assertEquals(before, stored(hidden.id()));
            }
        error(mvc.perform(cancel(Role.PATIENT, UUID.randomUUID(), "{}")), 404, "ORDER_NOT_FOUND", null);
        error(mvc.perform(cancel(Role.ADMIN, UUID.randomUUID(), "{\"reason\":\"Synthetic reason\"}")), 404, "ORDER_NOT_FOUND", null);
        var owned = create(own, first);
        jdbc.update("UPDATE patients SET user_id=NULL WHERE id=?", own.getId());
        error(mvc.perform(cancel(Role.PATIENT, owned.id(), "{}")), 404, "ORDER_NOT_FOUND", null);
    }

    @Test
    void staffReasonIsRequiredEvenForRepeatsAndPatientBlankReasonRemainsNull() throws Exception {
        var initial = create(own, first);
        var before = stored(initial.id());
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST))
            for (String body : List.of("{}", "{\"reason\":null}", "{\"reason\":\"\"}", "{\"reason\":\" \\t \"}")) {
                error(mvc.perform(cancel(role, initial.id(), body)), 400, "VALIDATION_ERROR", "reason");
                assertEquals(before, stored(initial.id()));
            }
        var cancelled = response(mvc.perform(cancel(Role.PATIENT, initial.id(), "{}")).andExpect(status().isOk()).andReturn());
        assertNull(cancelled.cancellationReason());
        error(mvc.perform(cancel(Role.ADMIN, initial.id(), "{}")), 400, "VALIDATION_ERROR", "reason");
        assertEquals(cancelled, response(mvc.perform(cancel(Role.RECEPTIONIST, initial.id(), "{\"reason\":\"Later valid staff reason\"}"))
                .andExpect(status().isOk()).andReturn()));
    }

    @Test
    void repeatedAuthorizedCancellationPreservesTheOriginalActorTimeReasonAndUpdatedTimestamp() throws Exception {
        var initial = create(own, first, free);
        var cancelled = response(mvc.perform(cancel(Role.ADMIN, initial.id(), "{\"reason\":\"First synthetic cancellation\"}"))
                .andExpect(status().isOk()).andReturn());
        var before = stored(initial.id());
        var oldItems = items(initial.id());
        for (Role role : List.of(Role.PATIENT, Role.ADMIN, Role.RECEPTIONIST)) {
            var again = response(mvc.perform(cancel(role, initial.id(), "{\"reason\":\"Another synthetic reason\"}"))
                    .andExpect(status().isOk()).andReturn());
            assertEquals(cancelled, again);
            assertEquals(before, stored(initial.id()));
            assertEquals(oldItems, items(initial.id()));
        }
        mvc.perform(post("/api/orders/" + initial.id() + "/cancel").header("Authorization", "Bearer " + strangerToken)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNotFound());
    }

    @Test
    void malformedTypesUnknownFieldsMissingBodyAndOverlongReasonsAreRejectedWithoutWrites() throws Exception {
        var initial = create(own, first);
        var before = stored(initial.id());
        for (String body : List.of("", "{", "null", "[]", "1", "{\"reason\":1}", "{\"reason\":true}", "{\"reason\":{}}", "{\"reason\":[]}",
                "{\"status\":\"CANCELLED\"}", "{\"cancelledBy\":\"untrusted\"}", "{\"reason\":\"Synthetic\",\"updatedAt\":\"untrusted\"}"))
            error(mvc.perform(cancel(Role.PATIENT, initial.id(), body)), 400, "INVALID_JSON", null);
        for (Role role : List.of(Role.PATIENT, Role.ADMIN, Role.RECEPTIONIST))
            error(mvc.perform(cancel(role, initial.id(), json.writeValueAsString(Map.of("reason", "a".repeat(1001))))), 400, "VALIDATION_ERROR", "reason");
        assertEquals(before, stored(initial.id()));
        var boundary = response(mvc.perform(cancel(Role.ADMIN, initial.id(), json.writeValueAsString(Map.of("reason", " " + "a".repeat(1000) + " "))))
                .andExpect(status().isOk()).andReturn());
        assertEquals(1000, boundary.cancellationReason().length());
    }

    @Test
    void pathValidationAndExactWriteRouteLeaveNoArbitraryStatusOrDeleteApi() throws Exception {
        for (String id : List.of("bad", "1-1-1-1-1", "00000000-0000-0000-0000-00000000000G"))
            error(mvc.perform(bearer(post("/api/orders/" + id + "/cancel").contentType(MediaType.APPLICATION_JSON).content("{}"), Role.PATIENT)), 400, "VALIDATION_ERROR", "id");
        var initial = create(own, first);
        for (Role role : Role.values()) {
            mvc.perform(bearer(patch("/api/orders/" + initial.id()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"COMPLETED\"}"), role))
                    .andExpect(status().isForbidden());
            mvc.perform(bearer(delete("/api/orders/" + initial.id()), role)).andExpect(status().isForbidden());
        }
        mvc.perform(bearer(post("/api/orders/" + initial.id().toString().toUpperCase(Locale.ROOT) + "/cancel")
                .contentType(MediaType.APPLICATION_JSON).content("{}"), Role.PATIENT)).andExpect(status().isOk());
    }

    @Test
    void cancellationRequiresEligibleCurrentRolesAndChecksThemOnEveryRepeat() throws Exception {
        var initial = create(own, first);
        error(mvc.perform(cancel(Role.LAB_TECHNICIAN, initial.id(), "{}")), 403, "FORBIDDEN", null);
        var forged = actor(actors.get(Role.LAB_TECHNICIAN).getId(), Role.ADMIN);
        assertEquals("FORBIDDEN", assertThrows(OrderException.class,
                () -> cancellations.cancel(forged, initial.id().toString(), new CancelOrderRequest("Synthetic"))).getCode());
        assertEquals("UNAUTHORIZED", assertThrows(OrderException.class,
                () -> cancellations.cancel(null, initial.id().toString(), new CancelOrderRequest(null))).getCode());
        assertThrows(jakarta.validation.ConstraintViolationException.class,
                () -> cancellations.cancel(actor(Role.PATIENT), initial.id().toString(), null));
        assertThrows(jakarta.validation.ConstraintViolationException.class,
                () -> cancellations.cancel(actor(Role.PATIENT), initial.id().toString(), new CancelOrderRequest("a".repeat(1001))));
        var actorId = actors.get(Role.PATIENT).getId();
        for (String change : List.of("enabled=false", "email_verified_at=NULL", "password_hash=NULL", "invitation_accepted_at=NULL")) {
            var original = jdbc.queryForMap("SELECT enabled,email_verified_at,password_hash,invitation_accepted_at FROM users WHERE id=?", actorId);
            jdbc.update("UPDATE users SET " + change + " WHERE id=?", actorId);
            mvc.perform(cancel(Role.PATIENT, initial.id(), "{}")).andExpect(status().isUnauthorized());
            assertEquals("UNAUTHORIZED", assertThrows(OrderException.class,
                    () -> cancellations.cancel(actor(Role.PATIENT), initial.id().toString(), new CancelOrderRequest(null))).getCode());
            jdbc.update("UPDATE users SET enabled=?,email_verified_at=?,password_hash=?,invitation_accepted_at=? WHERE id=?",
                    original.get("enabled"), original.get("email_verified_at"), original.get("password_hash"), original.get("invitation_accepted_at"), actorId);
        }
        assertEquals("PENDING", stored(initial.id()).get("status"));
        mvc.perform(cancel(Role.PATIENT, initial.id(), "{}")).andExpect(status().isOk());
        var cancelled = stored(initial.id());
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", actorId);
        mvc.perform(cancel(Role.PATIENT, initial.id(), "{}")).andExpect(status().isUnauthorized());
        assertEquals(cancelled, stored(initial.id()));
    }

    @Test
    void cookieCancellationRequiresCsrfAndBearerPrecedenceIsPreserved() throws Exception {
        var initial = create(own, first);
        var cookieRequest = post("/api/orders/" + initial.id() + "/cancel").contentType(MediaType.APPLICATION_JSON).content("{}")
                .cookie(new Cookie("access_token", tokens.get(Role.PATIENT)));
        mvc.perform(cookieRequest).andExpect(status().isForbidden());
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        mvc.perform(cookieRequest.cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue())).andExpect(status().isOk());
        mvc.perform(post("/api/orders/" + initial.id() + "/cancel").contentType(MediaType.APPLICATION_JSON).content("{}")
                .cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue())).andExpect(status().isUnauthorized());
        var next = create(own, first);
        mvc.perform(cancel(Role.PATIENT, next.id(), "{}").cookie(new Cookie("access_token", tokens.get(Role.LAB_TECHNICIAN))))
                .andExpect(status().isOk());
        mvc.perform(post("/api/orders/" + next.id() + "/cancel").contentType(MediaType.APPLICATION_JSON).content("{}")
                .cookie(new Cookie("access_token", tokens.get(Role.PATIENT))).header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
    }

    @Test
    void cancellationIsVisibleToOwnedReadsAndCreationReplayWithoutChangingHistoricalValue() throws Exception {
        var initial = create(own, first, free);
        UUID key = jdbc.queryForObject("SELECT idempotency_key FROM test_orders WHERE id=?", UUID.class, initial.id());
        var cancelled = cancellations.cancel(actor(Role.RECEPTIONIST), initial.id().toString(), new CancelOrderRequest("Synthetic cancellation"));
        var replay = creation.create(actor(Role.ADMIN), new CreateStaffOrderRequest(own.getId().toString(),
                List.of(first.getId().toString(), free.getId().toString())), List.of(key.toString()));
        assertFalse(replay.created());
        assertEquals(cancelled, replay.order());
        var detail = response(mvc.perform(bearer(get("/api/orders/me/" + initial.id()), Role.PATIENT)).andExpect(status().isOk()).andReturn());
        assertEquals(cancelled, detail);
        mvc.perform(bearer(get("/api/orders/me").param("status", "CANCELLED"), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].testCount").value(2))
                .andExpect(jsonPath("$.content[0].totalAmount").value(12.34)).andExpect(jsonPath("$.content[0].canCancel").value(false));
        assertEquals(2, items(initial.id()).size());
    }

    @Test
    void failedCancellationFlushRollsBackAllMetadataAndCanBeRetried() throws Exception {
        var initial = create(own, first, free);
        var before = stored(initial.id());
        var beforeItems = items(initial.id());
        jdbc.execute("CREATE FUNCTION synthetic_reject_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
                + "IF NEW.status='CANCELLED' THEN RAISE EXCEPTION 'synthetic cancellation failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER synthetic_reject_cancellation BEFORE UPDATE ON test_orders FOR EACH ROW EXECUTE FUNCTION synthetic_reject_cancellation()");
        try {
            var result = mvc.perform(cancel(Role.PATIENT, initial.id(), "{}"));
            error(result, 500, "INTERNAL_SERVER_ERROR", null);
            result.andExpect(jsonPath("$.message").value("An unexpected error occurred."));
            assertEquals(before, stored(initial.id()));
            assertEquals(beforeItems, items(initial.id()));
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_reject_cancellation ON test_orders");
            jdbc.execute("DROP FUNCTION synthetic_reject_cancellation()");
        }
        mvc.perform(cancel(Role.PATIENT, initial.id(), "{}")).andExpect(status().isOk());
    }

    @Test
    void concurrentPatientAndStaffCancellationsReturnTheSameOriginalRecord() throws Exception {
        var initial = create(own, first, free);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var patient = executor.submit(() -> {
                start.await();
                return cancellations.cancel(actor(Role.PATIENT), initial.id().toString(), new CancelOrderRequest("Patient synthetic request"));
            });
            var staff = executor.submit(() -> {
                start.await();
                return cancellations.cancel(actor(Role.ADMIN), initial.id().toString(), new CancelOrderRequest("Staff synthetic request"));
            });
            start.countDown();
            var first = patient.get(15, TimeUnit.SECONDS);
            var second = staff.get(15, TimeUnit.SECONDS);
            assertEquals(first, second);
            UUID expectedActor = actors.get(first.cancellationReason().equals("Patient synthetic request") ? Role.PATIENT : Role.ADMIN).getId();
            assertEquals(expectedActor, stored(initial.id()).get("cancelled_by"));
            assertEquals(2, items(initial.id()).size());
        }
    }

    @Test
    void cancellationWaitsForProcessingOrderLockAndRejectsTheCommittedInProgressState() throws Exception {
        var initial = create(own, first);
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var started = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var processing = executor.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
                var order = orders.findForUpdate(initial.id()).orElseThrow();
                order.setStatus(com.smartlims.orders.entity.OrderStatus.IN_PROGRESS);
                orders.flush();
                locked.countDown();
                await(release);
                return true;
            }));
            assertTrue(locked.await(5, TimeUnit.SECONDS));
            var cancellation = executor.submit(() -> {
                started.countDown();
                try {
                    cancellations.cancel(actor(Role.PATIENT), initial.id().toString(), new CancelOrderRequest(null));
                    return "unexpected success";
                } catch (OrderException error) {
                    return error.getCode();
                }
            });
            try {
                assertTrue(started.await(5, TimeUnit.SECONDS));
                assertThrows(TimeoutException.class, () -> cancellation.get(200, TimeUnit.MILLISECONDS));
            } finally {
                release.countDown();
            }
            assertTrue(processing.get(10, TimeUnit.SECONDS));
            assertEquals("ORDER_NOT_CANCELLABLE", cancellation.get(10, TimeUnit.SECONDS));
        }
        var stored = stored(initial.id());
        assertEquals("IN_PROGRESS", stored.get("status"));
        assertNull(stored.get("cancelled_by"));
        assertNull(stored.get("cancelled_at"));
        assertNull(stored.get("cancellation_reason"));
    }

    @Test
    void cancellationDoesNotAcquireAnInvertedPatientWriteLock() throws Exception {
        var initial = create(own, first);
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var profileWriter = executor.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
                patients.findWithLockById(own.getId()).orElseThrow();
                locked.countDown();
                await(release);
                return true;
            }));
            assertTrue(locked.await(5, TimeUnit.SECONDS));
            try {
                var cancellation = executor.submit(() -> cancellations.cancel(actor(Role.PATIENT), initial.id().toString(), new CancelOrderRequest(null)));
                assertEquals("CANCELLED", cancellation.get(5, TimeUnit.SECONDS).status().name());
            } finally {
                release.countDown();
            }
            assertTrue(profileWriter.get(10, TimeUnit.SECONDS));
        }
    }

    private void await(CountDownLatch latch) {
        try {
            assertTrue(latch.await(10, TimeUnit.SECONDS));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(error);
        }
    }
}
