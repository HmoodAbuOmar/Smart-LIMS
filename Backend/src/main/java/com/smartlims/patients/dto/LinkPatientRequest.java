package com.smartlims.patients.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.annotation.JsonDeserialize;

public record LinkPatientRequest(
        @JsonDeserialize(using = PatientJson.Text.class) @NotBlank @Size(max = 128) String token) {
    @Override
    public String toString() { return "LinkPatientRequest[token=REDACTED]"; }
}
