package com.smartlims.notifications.dto;

import java.time.Instant;
import java.util.UUID;

public record NotificationResponse(UUID id, String category, String eventType, String title, String message,
                                   Instant createdAt, boolean read, Instant readAt, UUID orderId, UUID appointmentId,
                                   UUID resultId,
                                   UUID orderItemId, String navigationUrl) {
    public record UnreadCount(long unreadCount) {
    }

    public record MarkAllResult(int updatedCount) {
    }

    public record MarkRead() {
    }
}
