package com.smartlims.orders;

import com.smartlims.auth.entity.Role;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ReceptionistPaymentReadTest extends OrderWorkflowTestSupport {
    private static final String PATH = "/api/receptionist/payments";

    @Test
    void listAndOrderWorkspaceUsePersistedTransactionsAndExactFilteredTotals() throws Exception {
        var order = create(own, first);
        var otherOrder = create(other, first);
        var payment = transaction(order.id(), "REC-10", "PAYMENT", "CONFIRMED", "CARD", "10.20",
                "2026-11-14T21:55:00Z", "2026-11-14T22:00:00Z");
        transaction(order.id(), "REC-11", "REFUND", "CONFIRMED", "CASH", "2.15",
                "2026-11-15T21:59:59Z", null);
        transaction(order.id(), null, "PAYMENT", "PENDING", null, "4.50",
                "2026-11-15T21:00:00Z", null);
        transaction(order.id(), null, "PAYMENT", "FAILED", "CARD", "6.00",
                "2026-11-15T22:00:00Z", null);
        transaction(otherOrder.id(), null, "PAYMENT", "CONFIRMED", "CASH", "7.00",
                "2026-11-15T09:00:00Z", null);

        mvc.perform(bearer(get(PATH).param("search", order.orderNumber().toLowerCase(java.util.Locale.ROOT))
                .param("fromDate", "2026-11-15").param("toDate", "2026-11-15")
                .param("size", "1").param("page", "2"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.totalElements").value(3)).andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.last").value(true))
                .andExpect(jsonPath("$.content[0].id").value(payment.toString()))
                .andExpect(jsonPath("$.content[0].patientId").value(own.getId().toString()))
                .andExpect(jsonPath("$.content[0].patientName").value(own.getFullName()))
                .andExpect(jsonPath("$.content[0].transactionAt").value("2026-11-14T22:00:00Z"))
                .andExpect(jsonPath("$.financial.confirmedPayments").value(10.20))
                .andExpect(jsonPath("$.financial.refunds").value(2.15))
                .andExpect(jsonPath("$.financial.pendingPayments").value(4.50))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(8.05));
        mvc.perform(bearer(get(PATH).param("orderId", order.id().toString()).param("type", "REFUND")
                .param("status", "CONFIRMED").param("search", own.getFullName().toUpperCase(java.util.Locale.ROOT)),
                Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].type").value("REFUND"))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(-2.15));
        mvc.perform(bearer(get(PATH + "/" + payment), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.receiptNumber").value("REC-10"))
                .andExpect(jsonPath("$.orderId").value(order.id().toString()))
                .andExpect(jsonPath("$.orderNumber").value(order.orderNumber()))
                .andExpect(jsonPath("$.status").value("CONFIRMED")).andExpect(jsonPath("$.method").value("CARD"))
                .andExpect(jsonPath("$.amount").value(10.20)).andExpect(jsonPath("$.currency").value("ILS"));
        mvc.perform(bearer(get("/api/receptionist/orders/" + order.id()), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.order.totalAmount").value(12.34))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(8.05))
                .andExpect(jsonPath("$.outstanding").value(4.29));
    }

    @Test
    void validatesFiltersAndRestrictsPaymentReadsToReceptionists() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        for (var role : new Role[]{Role.ADMIN, Role.PATIENT, Role.LAB_TECHNICIAN}) {
            mvc.perform(bearer(get(PATH), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(get(PATH + "/" + UUID.randomUUID()), role)).andExpect(status().isForbidden());
        }
        mvc.perform(bearer(get(PATH).param("fromDate", "2026-11-16").param("toDate", "2026-11-15"),
                Role.RECEPTIONIST)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.toDate").exists());
        mvc.perform(bearer(get(PATH).param("type", "UNKNOWN"), Role.RECEPTIONIST))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.type").exists());
        mvc.perform(bearer(get(PATH).param("size", "101"), Role.RECEPTIONIST)).andExpect(status().isBadRequest());
        mvc.perform(bearer(get(PATH + "/" + UUID.randomUUID()), Role.RECEPTIONIST))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PAYMENT_TRANSACTION_NOT_FOUND"));
        mvc.perform(bearer(get(PATH), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(0.0));
    }

    private UUID transaction(UUID order, String receipt, String type, String status, String method, String amount,
                             String recorded, String confirmed) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO payment_transactions (id, order_id, receipt_number, type, status, method, amount,
                                                  recorded_at, confirmed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS timestamptz), CAST(? AS timestamptz))
                """, id, order, receipt, type, status, method, new BigDecimal(amount), recorded, confirmed);
        return id;
    }
}
