package com.smartlims.payments;

import com.smartlims.laboratory.dto.LaboratoryInput;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import tools.jackson.databind.annotation.JsonDeserialize;

import java.math.BigDecimal;

public record RecordPaymentRequest(
        @NotNull @Pattern(regexp = LaboratoryInput.UUID_PATTERN)
        @JsonDeserialize(using = LaboratoryInput.Text.class) String orderId,
        @NotNull @Positive @Digits(integer = 10, fraction = 2)
        @JsonDeserialize(using = LaboratoryInput.Decimal.class) BigDecimal amount,
        @NotNull @Pattern(regexp = "CASH|CARD")
        @JsonDeserialize(using = LaboratoryInput.Text.class) String method) {}
