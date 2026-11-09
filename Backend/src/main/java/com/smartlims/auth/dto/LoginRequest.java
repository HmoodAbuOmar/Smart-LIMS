package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record LoginRequest(@NotBlank String emailOrUserName, @NotNull String password) {
}
