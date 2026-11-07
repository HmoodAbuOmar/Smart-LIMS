package com.smartlims.auth.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record BulkAccountRequest(@NotNull @Size(min = 1, max = 100) List<@NotNull UUID> ids) {
}
