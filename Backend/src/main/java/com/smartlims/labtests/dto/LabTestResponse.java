package com.smartlims.labtests.dto;

import com.smartlims.labtests.entity.LabTestCategory;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import java.util.List;

public record LabTestResponse(UUID id, String code, String name, String description, BigDecimal price,
                              String currency, String sampleType, String preparationInstructions, boolean active,
                              Instant createdAt, Instant updatedAt, List<LabTestCategory> categories) {
}
