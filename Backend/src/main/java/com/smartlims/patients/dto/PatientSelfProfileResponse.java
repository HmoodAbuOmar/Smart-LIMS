package com.smartlims.patients.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smartlims.patients.entity.PatientGender;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Patient demographics and read-only account contact/completion for My Profile. */
@JsonInclude(JsonInclude.Include.ALWAYS)
public record PatientSelfProfileResponse(UUID id, String patientNumber, String fullName, LocalDate dateOfBirth,
        PatientGender gender, String phoneNumber, String address, Instant createdAt, Instant updatedAt,
        String email, boolean emailEditable, int completionPercentage, List<String> missingFields) {}
