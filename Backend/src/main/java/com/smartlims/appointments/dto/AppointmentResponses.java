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

    public record Today(LocalDate date, String timezone, TodayCounts counts, List<TodayAppointment> content) {
    }

    public record TodayCounts(long arrivals, long checkedIn, long notArrived) {
    }

    public record TodayPatient(UUID id, String fileNumber, String fullName) {
    }

    public record TodayAppointment(UUID id, Instant startsAt, Instant endsAt, LocalDate appointmentDate,
                                   LocalTime appointmentTime, TodayPatient patient, UUID orderId, String orderNumber,
                                   List<UUID> orderItemIds, String status, long version, Instant arrivedAt,
                                   boolean checkInEligible, boolean noShowSupported) {
    }

    public record ReceptionistList(LocalDate date, String timezone, List<ReceptionistAppointment> content,
                                   int page, int size, long totalElements, int totalPages, boolean first, boolean last) {
    }

    public record ReceptionistAppointment(UUID id, UUID slotId, Instant startsAt, Instant endsAt,
                                          LocalDate appointmentDate, LocalTime appointmentTime, long booked, int capacity,
                                          TodayPatient patient, UUID orderId, String orderNumber, List<UUID> orderItemIds,
                                          String status, long version, Instant arrivedAt, boolean checkInEligible,
                                          boolean canReschedule, boolean canCancel) {
    }
}
