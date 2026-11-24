package com.smartlims.orders;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OrderRefundTest extends OrderWorkflowTestSupport {
    private static final String PAYMENTS = "/api/receptionist/payments";

    @Test
    void refundLedgerGatesCancellationAndPreservesOriginalPayments() throws Exception {
        var unpaid = create(own, first);
        mvc.perform(cancel(unpaid.id())).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        var order = create(own, first);
        var original = pay(order.id(), "7.34");
        mvc.perform(cancel(order.id())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_REFUND_REQUIRED"));
        var second = pay(order.id(), "5");
        mvc.perform(bearer(get(path(order.id()) + "/payment-transactions"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(12.34));
        mvc.perform(cancel(order.id())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_REFUND_REQUIRED"));
        var at = LaboratoryInput.now().toString();
        var key = UUID.randomUUID();
        var oversized = refundBody(original, "8", "refund-over", at);
        mvc.perform(refund(order.id(), oversized, UUID.randomUUID(), Role.ADMIN)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REFUND_EXCEEDS_AVAILABLE_AMOUNT"));
        var body = refundBody(original, "7.34", "refund-one", at);
        mvc.perform(refund(order.id(), body, key, Role.RECEPTIONIST)).andExpect(status().isForbidden());
        mvc.perform(refund(order.id(), body, key, Role.PATIENT)).andExpect(status().isForbidden());
        var response = mvc.perform(refund(order.id(), body, key, Role.ADMIN))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.transaction.refund.originalPaymentId").value(original))
                .andExpect(jsonPath("$.transaction.refund.recordedBy").value(actors.get(Role.ADMIN).getId().toString()))
                .andExpect(jsonPath("$.transaction.refund.reason").value("Cancelled at patient request"))
                .andExpect(jsonPath("$.transaction.refund.occurredAt").value(at))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(5.0)).andReturn().getResponse();
        var refundId = json.readTree(response.getContentAsByteArray()).path("transaction").path("id").asString();
        mvc.perform(cancel(order.id())).andExpect(status().isConflict());
        mvc.perform(refund(order.id(), refundBody(second, "5", "refund-one", at), UUID.randomUUID(), Role.ADMIN))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REFUND_CONFIRMATION_ALREADY_RECORDED"));
        mvc.perform(refund(order.id(), refundBody(second, "5", "refund-two", at), key, Role.ADMIN))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        mvc.perform(refund(order.id(), refundBody(second, "5", "refund-two", at), UUID.randomUUID(), Role.ADMIN))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.financial.netConfirmedCollections").value(0.0));
        mvc.perform(cancel(order.id())).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(cancel(order.id())).andExpect(status().isOk());
        mvc.perform(refund(order.id(), body, key, Role.ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.transaction.id").value(refundId));
        mvc.perform(payment(order.id(), "1")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_PAYABLE"));
        mvc.perform(bearer(get(PAYMENTS + "/" + refundId), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.type").value("REFUND"))
                .andExpect(jsonPath("$.refund.originalPaymentId").value(original));
        mvc.perform(bearer(get(PAYMENTS).param("orderId", order.id().toString()), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.financial.confirmedPayments").value(12.34))
                .andExpect(jsonPath("$.financial.refunds").value(12.34));
        mvc.perform(bearer(get("/api/receptionist/orders/" + order.id()), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outstanding").value(0.0))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(0.0));
        assertEquals(2, jdbc.queryForObject(
                "SELECT count(*) FROM payment_transactions WHERE type='PAYMENT' AND status='CONFIRMED'", Integer.class));
        assertEquals(2, jdbc.queryForObject(
                "SELECT count(*) FROM audit_logs WHERE entity_type='payment transaction'", Integer.class));
    }

    @Test
    void concurrentRefundsCannotBothConsumeTheSameRemainingBalance() throws Exception {
        var order = create(own, first);
        var original = pay(order.id(), "7.34");
        var at = LaboratoryInput.now().toString();
        var gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var requests = List.of(refundBody(original, "7.34", "race-one", at),
                    refundBody(original, "7.34", "race-two", at));
            var calls = requests.stream().map(body -> pool.submit(() -> {
                gate.await();
                return mvc.perform(refund(order.id(), body, UUID.randomUUID(), Role.ADMIN))
                        .andReturn().getResponse().getStatus();
            })).toList();
            gate.countDown();
            var statuses = List.of(calls.get(0).get(15, TimeUnit.SECONDS), calls.get(1).get(15, TimeUnit.SECONDS));
            assertTrue(statuses.containsAll(List.of(201, 409)), statuses.toString());
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM payment_transactions WHERE type='REFUND'", Integer.class));
        mvc.perform(cancel(order.id())).andExpect(status().isOk());
    }

    @Test
    void retainsEligibilityAndBlocksUnallocatedLegacyRefunds() throws Exception {
        var order = create(own, first);
        var original = pay(order.id(), "6");
        jdbc.update("""
                INSERT INTO payment_transactions (id, order_id, type, status, amount)
                VALUES (?, ?, 'REFUND', 'CONFIRMED', 1.00)
                """, UUID.randomUUID(), order.id());
        var body = refundBody(original, "5", "legacy-confirmation", LaboratoryInput.now().toString());
        mvc.perform(refund(order.id(), body, UUID.randomUUID(), Role.ADMIN)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REFUND_RECONCILIATION_REQUIRED"));
        var unrelated = create(other, first);
        mvc.perform(refund(unrelated.id(), body, UUID.randomUUID(), Role.ADMIN)).andExpect(status().isNotFound());
        jdbc.update("UPDATE test_orders SET status='IN_PROGRESS' WHERE id=?", order.id());
        mvc.perform(refund(order.id(), body, UUID.randomUUID(), Role.ADMIN)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_CANCELLABLE"));
        mvc.perform(cancel(order.id())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_CANCELLABLE"));
    }

    private String pay(UUID order, String amount) throws Exception {
        var response = mvc.perform(payment(order, amount)).andExpect(status().isCreated()).andReturn().getResponse();
        return json.readTree(response.getContentAsByteArray()).path("transaction").path("id").asString();
    }

    private MockHttpServletRequestBuilder payment(UUID order, String amount) {
        return bearer(post(PAYMENTS).header("Idempotency-Key", UUID.randomUUID()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("orderId", order, "amount", new BigDecimal(amount),
                        "method", "CASH"))), Role.RECEPTIONIST);
    }

    private MockHttpServletRequestBuilder cancel(UUID order) {
        return bearer(post(path(order) + "/cancel").contentType("application/json")
                .content("{\"reason\":\"Patient request\"}"), Role.RECEPTIONIST);
    }

    private MockHttpServletRequestBuilder refund(UUID order, String body, UUID key, Role role) {
        return bearer(post(path(order) + "/refunds").header("Idempotency-Key", key)
                .contentType("application/json").content(body), role);
    }

    private String refundBody(String original, String amount, String reference, String at) {
        return json.writeValueAsString(Map.of("originalPaymentId", original, "amount", new BigDecimal(amount),
                "reason", "Cancelled at patient request", "confirmationReference", reference, "occurredAt", at));
    }

    private static String path(UUID order) {
        return "/api/orders/" + order;
    }
}
