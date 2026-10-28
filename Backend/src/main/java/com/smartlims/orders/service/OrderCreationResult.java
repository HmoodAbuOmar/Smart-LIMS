package com.smartlims.orders.service;

import com.smartlims.orders.dto.OrderDetailResponse;

public record OrderCreationResult(OrderDetailResponse order, boolean created) {}
