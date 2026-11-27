package com.smartlims.payments;

import com.smartlims.laboratory.dto.LaboratoryInput;
import jakarta.validation.constraints.*;
import tools.jackson.databind.annotation.JsonDeserialize;

import java.math.BigDecimal;

public record RecordRefundRequest(
        @NotNull @Pattern(regexp = LaboratoryInput.UUID_PATTERN)
        @JsonDeserialize(using = LaboratoryInput.Text.class) String originalPaymentId,
        @NotNull @Positive @Digits(integer = 10, fraction = 2)
        @JsonDeserialize(using = LaboratoryInput.Decimal.class) BigDecimal amount,
        @NotBlank @Size(max = 1000)
        @JsonDeserialize(using = LaboratoryInput.Text.class) String reason,
        @NotNull @Pattern(regexp = "[A-Za-z0-9._:/-]{1,100}")
        @JsonDeserialize(using = LaboratoryInput.Text.class) String confirmationReference,
        @NotNull @JsonDeserialize(using = LaboratoryInput.Text.class) String occurredAt) {}
