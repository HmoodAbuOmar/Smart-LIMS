package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record SetPasswordRequest(@NotNull UUID userId, @NotBlank String token, @NotNull String newPassword) {}
