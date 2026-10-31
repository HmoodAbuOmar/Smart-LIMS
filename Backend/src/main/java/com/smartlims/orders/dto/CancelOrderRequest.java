package com.smartlims.orders.dto;

import jakarta.validation.constraints.Size;
import tools.jackson.databind.annotation.JsonDeserialize;

public record CancelOrderRequest(
        @JsonDeserialize(using = OrderJson.Text.class) @Size(max = 1000) String reason) {
    public CancelOrderRequest {
        reason = reason == null || reason.isBlank() ? null : reason.strip();
    }
}
