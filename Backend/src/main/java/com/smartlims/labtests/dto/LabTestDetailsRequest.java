package com.smartlims.labtests.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import tools.jackson.databind.annotation.JsonDeserialize;

/** The Details form cannot change category assignments or availability. */
public record LabTestDetailsRequest(
        @JsonDeserialize(using = LabTestJson.Text.class) @NotBlank
        @Pattern(regexp = "[A-Z0-9][A-Z0-9_-]{0,29}") String code,
        @JsonDeserialize(using = LabTestJson.Text.class) @NotBlank @Size(max = 150) String name,
        @JsonDeserialize(using = LabTestJson.Text.class) @Size(max = 10000) String description,
        @JsonDeserialize(using = LabTestJson.Money.class) @NotNull @DecimalMin("0")
        @Digits(integer = 10, fraction = 2) BigDecimal price,
        @JsonDeserialize(using = LabTestJson.Text.class) @Pattern(regexp = "ILS") String currency,
        @JsonDeserialize(using = LabTestJson.Text.class) @NotBlank @Size(max = 40) String sampleType,
        @JsonDeserialize(using = LabTestJson.Text.class) @Size(max = 10000) String preparationInstructions) {
    public LabTestDetailsRequest {
        var normalized = new LabTestRequest(code, name, description, price, currency, sampleType, preparationInstructions, List.of());
        code = normalized.code();
        name = normalized.name();
        description = normalized.description();
        currency = normalized.currency();
        sampleType = normalized.sampleType();
        preparationInstructions = normalized.preparationInstructions();
    }

    public LabTestRequest asCatalogRequest() {
        return new LabTestRequest(code, name, description, price, currency, sampleType, preparationInstructions, List.of());
    }
}
