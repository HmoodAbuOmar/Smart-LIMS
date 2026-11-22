package com.smartlims.laboratory.dto;

import java.math.BigDecimal;

/** Absence of transaction storage must never be represented as zero cash activity. */
public record FinancialSummary(boolean supported, String currency, BigDecimal confirmedPayments,
                               BigDecimal refunds, BigDecimal netConfirmedCollections,
                               BigDecimal pendingPayments, String source) {
    public static FinancialSummary unsupported() {
        return new FinancialSummary(false, "ILS", null, null, null, null,
                "Payment and refund transactions are not implemented; order value is not payment evidence.");
    }
}
