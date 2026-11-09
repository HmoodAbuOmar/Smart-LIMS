package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record EmailRequest(@NotBlank String email) {
}
