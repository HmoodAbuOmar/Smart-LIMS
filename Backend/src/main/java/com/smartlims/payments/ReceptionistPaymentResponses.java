package com.smartlims.payments;

import com.smartlims.laboratory.dto.FinancialSummary;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ReceptionistPaymentResponses {
    private ReceptionistPaymentResponses() {}

    public record Transaction(UUID id, String receiptNumber, UUID orderId, String orderNumber,
                              UUID patientId, String patientName, String patientNumber, String type,
                              String status, String method, BigDecimal amount, String currency,
                              Instant recordedAt, Instant confirmedAt, Instant transactionAt, RefundDetails refund) {}

    public record RefundDetails(UUID originalPaymentId, String reason, UUID recordedBy,
                                String confirmationReference, Instant occurredAt) {}

    public record RecordedRefund(Transaction transaction, FinancialSummary financial) {}

    public record Page(List<Transaction> content, int page, int size, long totalElements, long totalPages,
                       boolean first, boolean last, String timezone, FinancialSummary financial) {}

    public record Balance(BigDecimal total, BigDecimal paid, BigDecimal outstanding, String currency) {
        public static Balance of(BigDecimal total, BigDecimal paid, String currency) {
            return new Balance(total, paid, total.subtract(paid).max(new BigDecimal("0.00")), currency);
        }
    }

    public record EligibleOrder(UUID orderId, String orderNumber, UUID patientId, String patientName, Balance balance) {}

    public record Recorded(Transaction transaction, Balance balance) {}
}
