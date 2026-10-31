package com.smartlims.orders.dto;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import tools.jackson.databind.annotation.JsonDeserialize;

public record CreateSelfOrderRequest(
        @JsonDeserialize(using = OrderJson.TestIds.class) @ValidOrderTestIds List<String> testIds) {
    public CreateSelfOrderRequest {
        testIds = testIds == null ? null : Collections.unmodifiableList(new ArrayList<>(testIds));
    }
}
