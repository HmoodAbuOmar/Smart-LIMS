package com.smartlims.orders.dto;

import com.smartlims.laboratory.dto.FinancialSummary;
import com.smartlims.orders.entity.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AdminOrderPage(List<Row> content, int page, int size, long totalElements, int totalPages,
                             boolean first, boolean last, Summary summary) {
    public record Row(UUID id, String orderNumber, UUID patientId, String patientName,
                      List<OrderItemResponse> items, BigDecimal totalAmount, String currency,
                      String paymentStatus, OrderStatus status, Instant createdAt) {}
    public record Summary(long totalOrders, BigDecimal orderValue, FinancialSummary financial) {}
}
