package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegistrationRequest(
        @NotBlank @Size(min = 3, max = 80) String fullName,
        @NotBlank @jakarta.validation.constraints.Email @Size(max = 120) String email,
        @NotNull String password,
        @NotNull String confirmPassword) {
    public RegistrationRequest {
        email = email == null ? null : email.strip();
    }

    @Override
    public String toString() {
        return "RegistrationRequest[fullName=" + fullName + ", email=" + email
                + ", password=[REDACTED], confirmPassword=[REDACTED]]";
    }
}
