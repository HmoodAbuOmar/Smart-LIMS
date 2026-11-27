package com.smartlims.orders;

import com.smartlims.auth.entity.Role;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ReceptionistPaymentRecordingTest extends OrderWorkflowTestSupport {
    private static final String PATH = "/api/receptionist/payments";

    @Test
    void recordsPartialThenFullPaymentAndUpdatesExistingReads() throws Exception {
        var order = create(own, first);
        create(other, free);
        var cancelled = create(other, first);
        jdbc.update("""
                UPDATE test_orders SET status='CANCELLED', cancelled_at=created_at, cancelled_by=? WHERE id=?
                """, actors.get(Role.RECEPTIONIST).getId(), cancelled.id());
        mvc.perform(bearer(get(PATH + "/eligible-orders").param("size", "1"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].orderId").value(order.id().toString()))
                .andExpect(jsonPath("$.content[0].patientId").value(own.getId().toString()))
                .andExpect(jsonPath("$.content[0].balance.outstanding").value(12.34));
        var key = UUID.randomUUID();
        var response = mvc.perform(record(order.id(), "5.10", "CARD", key))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.transaction.receiptNumber").isNotEmpty())
                .andExpect(jsonPath("$.transaction.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.transaction.method").value("CARD"))
                .andExpect(jsonPath("$.transaction.amount").value(5.10))
                .andExpect(jsonPath("$.balance.total").value(12.34))
                .andExpect(jsonPath("$.balance.paid").value(5.10))
                .andExpect(jsonPath("$.balance.outstanding").value(7.24)).andReturn().getResponse();
        var receipt = json.readTree(response.getContentAsByteArray()).path("transaction").path("id").asString();
        assertEquals(PATH + "/" + receipt, response.getHeader("Location"));
        mvc.perform(record(order.id(), "5.1", "CARD", key))
                .andExpect(status().isOk()).andExpect(jsonPath("$.transaction.id").value(receipt));
        mvc.perform(record(order.id(), "5.10", "CASH", key))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        mvc.perform(record(order.id(), "7.25", "CASH", UUID.randomUUID()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_EXCEEDS_OUTSTANDING"));
        mvc.perform(record(order.id(), "7.24", "CASH", UUID.randomUUID()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.balance.outstanding").value(0.0));
        mvc.perform(record(order.id(), "5.10", "CARD", key))
                .andExpect(status().isOk()).andExpect(jsonPath("$.transaction.id").value(receipt))
                .andExpect(jsonPath("$.balance.outstanding").value(0.0));
        mvc.perform(record(order.id(), "0.01", "CASH", UUID.randomUUID()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_NOT_PAYABLE"));
        mvc.perform(record(cancelled.id(), "1", "CASH", UUID.randomUUID()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_NOT_PAYABLE"));
        mvc.perform(bearer(get(PATH + "/eligible-orders"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
        mvc.perform(bearer(get(PATH).param("orderId", order.id().toString()), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(12.34));
        mvc.perform(bearer(get(PATH + "/" + receipt), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(receipt));
        mvc.perform(bearer(get("/api/receptionist/orders/" + order.id()), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.financial.netConfirmedCollections").value(12.34))
                .andExpect(jsonPath("$.outstanding").value(0.0));
        assertEquals(actors.get(Role.RECEPTIONIST).getId(),
                jdbc.queryForObject("SELECT recorded_by FROM payment_transactions WHERE id=?", UUID.class,
                        UUID.fromString(receipt)));
    }

    @Test
    void rejectsUnauthorizedOrInvalidRequests() throws Exception {
        var order = create(own, first);
        for (var role : new Role[]{Role.ADMIN, Role.PATIENT, Role.LAB_TECHNICIAN}) {
            mvc.perform(bearer(get(PATH + "/eligible-orders"), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(post(PATH), role)).andExpect(status().isForbidden());
        }
        mvc.perform(get(PATH + "/eligible-orders")).andExpect(status().isUnauthorized());
        mvc.perform(post(PATH)).andExpect(status().isForbidden());
        for (var amount : new String[]{"0", "-1", "1.001", "10000000000"}) {
            mvc.perform(record(order.id(), amount, "CARD", UUID.randomUUID()))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.amount").exists());
        }
        mvc.perform(record(order.id(), "1", "CHECK", UUID.randomUUID()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.method").exists());
        mvc.perform(record(order.id(), "1", "CASH", null))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.idempotencyKey").exists());
        mvc.perform(record(UUID.randomUUID(), "1", "CASH", UUID.randomUUID())).andExpect(status().isNotFound());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM payment_transactions", Integer.class));
    }

    @Test
    void serializesCompetingPaymentsAndReplaysConcurrentDuplicates() throws Exception {
        var order = create(own, first);
        var result = race(() -> code(record(order.id(), "8", "CASH", UUID.randomUUID())),
                () -> code(record(order.id(), "8", "CARD", UUID.randomUUID())));
        assertTrue(result.containsAll(java.util.List.of(201, 409)), result.toString());
        var key = UUID.randomUUID();
        result = race(() -> code(record(order.id(), "4.34", "CASH", key)),
                () -> code(record(order.id(), "4.34", "CASH", key)));
        assertTrue(result.containsAll(java.util.List.of(201, 200)), result.toString());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM payment_transactions", Integer.class));
        assertEquals(new BigDecimal("12.34"),
                jdbc.queryForObject("SELECT sum(amount) FROM payment_transactions", BigDecimal.class));
    }

    @Test
    void concurrentReuseOfOneKeyAcrossOrdersCreatesOnePayment() throws Exception {
        var firstOrder = create(own, first);
        var secondOrder = create(other, first);
        var key = UUID.randomUUID();
        var result = race(() -> code(record(firstOrder.id(), "2", "CASH", key)),
                () -> code(record(secondOrder.id(), "2", "CASH", key)));
        assertTrue(result.containsAll(java.util.List.of(201, 409)), result.toString());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM payment_transactions", Integer.class));
    }

    private MockHttpServletRequestBuilder record(UUID orderId, String amount, String method, UUID key) {
        var request = bearer(post(PATH), Role.RECEPTIONIST).contentType("application/json")
                .content(json.writeValueAsString(Map.of("orderId", orderId, "amount", new BigDecimal(amount),
                        "method", method)));
        if (key != null)
            request.header("Idempotency-Key", key);
        return request;
    }

    private int code(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    private static java.util.List<Integer> race(Callable<Integer> left, Callable<Integer> right) throws Exception {
        var gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { gate.await(); return left.call(); });
            var second = pool.submit(() -> { gate.await(); return right.call(); });
            gate.countDown();
            return java.util.List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
        }
    }
}
