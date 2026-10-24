package com.smartlims.labtests.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record LabTestResponse(UUID id, String code, String name, String description, BigDecimal price,
        String currency, String sampleType, String preparationInstructions, boolean active,
        Instant createdAt, Instant updatedAt) {}
