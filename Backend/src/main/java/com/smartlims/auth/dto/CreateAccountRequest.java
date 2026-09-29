package com.smartlims.auth.dto;

import com.smartlims.auth.entity.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateAccountRequest(@NotBlank @Size(min = 3, max = 80) String fullName,
        @NotBlank @Email @Size(max = 120) String email, @NotBlank @Size(min = 3, max = 30) String userName,
        @NotBlank @jakarta.validation.constraints.Pattern(regexp = "^[+0-9 ()-]{3,20}$") String phoneNumber,
        @NotNull Role role) {}
