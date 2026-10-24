package com.smartlims.labtests.dto;

import jakarta.validation.constraints.NotNull;
import tools.jackson.databind.annotation.JsonDeserialize;

public record LabTestStatusRequest(
        @NotNull @JsonDeserialize(using = LabTestJson.BooleanValue.class) Boolean active) {}
