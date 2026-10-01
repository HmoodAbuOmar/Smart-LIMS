package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegistrationRequest(
        @NotBlank @Size(min = 3, max = 80) String fullName,
        @NotBlank @jakarta.validation.constraints.Email @Size(max = 120) String email,
        @NotBlank String userName,
        @NotBlank @jakarta.validation.constraints.Pattern(regexp = "^[+0-9 ()-]{3,20}$") String phoneNumber,
        @NotNull String password) {
    public RegistrationRequest { email = email == null ? null : email.strip(); }
}
