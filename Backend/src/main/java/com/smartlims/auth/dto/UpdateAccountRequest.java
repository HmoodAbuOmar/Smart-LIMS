package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateAccountRequest(@NotBlank @Size(min = 3, max = 80) String fullName,
        @NotBlank @jakarta.validation.constraints.Email @Size(max = 120) String email,
        @NotBlank @Size(min = 3, max = 30) String userName,
        @NotBlank @jakarta.validation.constraints.Pattern(regexp = "^[+0-9 ()-]{3,20}$") String phoneNumber) {}
