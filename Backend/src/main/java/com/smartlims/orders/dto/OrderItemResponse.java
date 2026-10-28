package com.smartlims.orders.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderItemResponse(UUID id, UUID labTestId, String testCode, String testName, BigDecimal priceAtOrder) {}
