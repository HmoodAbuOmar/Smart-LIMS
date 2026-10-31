package com.smartlims.labtests.dto;

import com.smartlims.labtests.entity.TestParameter;

import java.time.Instant;
import java.util.UUID;

public record TestParameterResponse(UUID id, UUID labTestId, String code, String name,
                                    TestParameter.ValueType resultType, String unit, String method, int displayOrder,
                                    boolean required, boolean active, long version, Instant createdAt,
                                    Instant updatedAt) {
    public static TestParameterResponse from(TestParameter p) {
        return new TestParameterResponse(p.getId(), p.getLabTest().getId(), p.getCode(), p.getName(), p.getResultType(), p.getUnit(), p.getMethod(), p.getDisplayOrder(), p.isRequired(), p.isActive(), p.getVersion(), p.getCreatedAt(), p.getUpdatedAt());
    }
}
