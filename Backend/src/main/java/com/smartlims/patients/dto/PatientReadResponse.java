package com.smartlims.patients.dto;

import com.smartlims.patients.entity.PatientGender;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Common demographics for role-specific profile reads. */
public sealed interface PatientReadResponse permits PatientResponse, StaffPatientResponse {
    UUID id();
    String patientNumber();
    String fullName();
    LocalDate dateOfBirth();
    PatientGender gender();
    String phoneNumber();
    String address();
    Instant createdAt();
    Instant updatedAt();
}
