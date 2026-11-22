package com.smartlims.appointments.dto;

import com.smartlims.appointments.entity.AppointmentStatus;

import java.time.*;
import java.util.*;

public final class AppointmentResponses {
    private AppointmentResponses() {
    }

    public record Slot(UUID id, Instant startsAt, Instant endsAt, int capacity, long remainingCapacity, boolean active,
                       String timezone) {
    }

    public record Detail(UUID id, UUID orderId, UUID slotId,
                         Instant startsAt, Instant endsAt, String timezone, LocalDate appointmentDate,
                         LocalTime appointmentTime, String utcOffset,
                         AppointmentStatus status, long version, boolean canReschedule, boolean canCancel,
                         String actionIneligibilityReason,
                         Instant createdAt, Instant updatedAt, Instant cancelledAt, String cancellationReason) {
    }

    public record Page<T>(List<T> content, int page, int size, long totalElements, int totalPages, boolean first,
                          boolean last) {
    }

    public record Booking(Detail appointment, boolean created) {
    }
}
