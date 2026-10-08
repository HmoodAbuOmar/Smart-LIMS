package com.smartlims.patients.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.entity.PatientGender;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record PatientResponse(UUID id, String patientNumber, String fullName, LocalDate dateOfBirth,
        PatientGender gender, String phoneNumber, String address, Instant createdAt, Instant updatedAt) {
    public static PatientResponse from(Patient patient) {
        return new PatientResponse(patient.getId(), patient.getPatientNumber(), patient.getFullName(),
                patient.getDateOfBirth(), patient.getGender(), patient.getPhoneNumber(), patient.getAddress(),
                patient.getCreatedAt(), patient.getUpdatedAt());
    }
}
