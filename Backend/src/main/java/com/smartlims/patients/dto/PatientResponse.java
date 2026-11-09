package com.smartlims.patients.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smartlims.patients.entity.PatientGender;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record PatientResponse(UUID id, String patientNumber, String fullName, LocalDate dateOfBirth,
                              PatientGender gender, String phoneNumber, String address, Instant createdAt,
                              Instant updatedAt) {
}
