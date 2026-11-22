package com.smartlims.auth.dto;

import com.smartlims.auth.entity.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateAccountRequest(@Size(min = 3, max = 80) @jakarta.validation.constraints.Pattern(regexp = ".*\\S.*") String fullName,
                                   @NotBlank @Email @Size(max = 120) String email,
                                   @jakarta.validation.constraints.Pattern(regexp = ".*\\S.*") String userName,
                                   @jakarta.validation.constraints.Pattern(regexp = "^(?=.*\\S)[+0-9 ()-]{3,20}$") String phoneNumber,
                                   @NotNull Role role) {
    public CreateAccountRequest {
        email = email == null ? null : email.strip();
    }
}
