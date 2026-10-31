package com.smartlims.orders.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import tools.jackson.databind.annotation.JsonDeserialize;

public record CreateStaffOrderRequest(
        @JsonDeserialize(using = OrderJson.Text.class) @NotNull @Pattern(regexp = UUID_PATTERN) String patientId,
        @JsonDeserialize(using = OrderJson.TestIds.class) @ValidOrderTestIds List<String> testIds) {
    public static final String UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    public CreateStaffOrderRequest {
        testIds = testIds == null ? null : Collections.unmodifiableList(new ArrayList<>(testIds));
    }
}
