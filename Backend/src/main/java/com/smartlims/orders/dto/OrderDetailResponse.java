package com.smartlims.orders.dto;

import com.smartlims.orders.entity.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record OrderDetailResponse(UUID id, String orderNumber, Instant createdAt, Instant updatedAt,
        int testCount, BigDecimal totalAmount, String currency, OrderStatus status, boolean canCancel,
        boolean visitDetailsAvailable, UUID patientId, List<OrderItemResponse> items,
        Instant cancelledAt, String cancellationReason) {}
