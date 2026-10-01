package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(@NotBlank String email, @NotBlank @Size(min = 4, max = 4) String code,
        @NotNull String newPassword) {
}
