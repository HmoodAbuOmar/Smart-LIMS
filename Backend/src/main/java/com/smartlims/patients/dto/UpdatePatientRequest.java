package com.smartlims.patients.dto;

import com.smartlims.patients.entity.PatientGender;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import tools.jackson.databind.annotation.JsonDeserialize;

public record UpdatePatientRequest(
        @JsonDeserialize(using = PatientJson.Text.class) @NotBlank @Size(max = 120) String fullName,
        @JsonDeserialize(using = PatientJson.BirthDate.class) @NotNull LocalDate dateOfBirth,
        @NotNull PatientGender gender,
        @JsonDeserialize(using = PatientJson.Text.class) @NotBlank @Size(max = 20) String phoneNumber,
        @JsonDeserialize(using = PatientJson.Text.class) @Size(max = 500) String address) {
    public UpdatePatientRequest {
        fullName = fullName == null ? null : fullName.strip();
        phoneNumber = phoneNumber == null ? null : phoneNumber.strip();
        address = address == null || address.isBlank() ? null : address.strip();
    }
}
