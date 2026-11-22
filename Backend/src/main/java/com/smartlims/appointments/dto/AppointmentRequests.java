package com.smartlims.appointments.dto;

import jakarta.validation.constraints.*;


import tools.jackson.databind.annotation.JsonDeserialize;

public final class AppointmentRequests {
    private AppointmentRequests() {
    }

    public static final String UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    public record SlotCreate(
            @JsonDeserialize(using = AppointmentJson.Text.class) @NotNull String startsAt,
            @JsonDeserialize(using = AppointmentJson.Text.class) @NotNull String endsAt,
            @JsonDeserialize(using = AppointmentJson.IntegerValue.class) @NotNull @Positive Integer capacity,
            @JsonDeserialize(using = AppointmentJson.BooleanValue.class) @NotNull Boolean active) {
    }

    public record SlotUpdate(
            @JsonDeserialize(using = AppointmentJson.IntegerValue.class) @NotNull @Positive Integer capacity,
            @JsonDeserialize(using = AppointmentJson.BooleanValue.class) @NotNull Boolean active) {
    }

    public record Book(
            @JsonDeserialize(using = AppointmentJson.Text.class) @NotNull @Pattern(regexp = UUID_PATTERN) String orderId,
            @JsonDeserialize(using = AppointmentJson.Text.class) @NotNull @Pattern(regexp = UUID_PATTERN) String slotId) {
    }

    public record Move(
            @JsonDeserialize(using = AppointmentJson.Text.class) @NotNull @Pattern(regexp = UUID_PATTERN) String slotId,
            @JsonDeserialize(using = AppointmentJson.LongValue.class) @NotNull @PositiveOrZero Long expectedVersion) {
    }

    public record Cancel(@JsonDeserialize(using = AppointmentJson.Text.class) @Size(max = 1000) String reason) {
        public Cancel {
            reason = reason == null || reason.isBlank() ? null : reason.strip();
        }
    }
}
