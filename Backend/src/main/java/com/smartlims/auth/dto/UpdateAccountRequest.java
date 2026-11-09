package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateAccountRequest(@NotBlank @Size(min = 3, max = 80) String fullName,
                                   @NotBlank @jakarta.validation.constraints.Email @Size(max = 120) String email,
                                   String userName,
                                   @jakarta.validation.constraints.Pattern(regexp = "^(?!\\s*$)[+0-9 ()-]{3,20}$") String phoneNumber) {
    public UpdateAccountRequest {
        email = email == null ? null : email.strip();
    }
}
