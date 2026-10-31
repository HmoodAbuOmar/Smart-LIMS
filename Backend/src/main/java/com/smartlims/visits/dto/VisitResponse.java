package com.smartlims.visits.dto;

import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.visits.entity.Visit;

import java.time.Instant;
import java.util.*;

public record VisitResponse(UUID id, String visitNumber, UUID orderId, String orderNumber, OrderStatus orderStatus,
                            Visit.Status status, long version, Instant arrivedAt, Instant completedAt,
                            UUID appointmentId, List<Item> tests, List<Specimen> specimens) {
    public record Item(UUID orderItemId, String testCode, String testName, String resultStatus, UUID currentResultId,
                       String resultUrl) {
    }

    public record Specimen(UUID id, String barcode, String sampleType, String status, Instant collectedAt,
                           Instant receivedAt) {
    }
}
