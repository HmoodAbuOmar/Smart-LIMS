package com.smartlims.labtests.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.Locale;
import tools.jackson.databind.annotation.JsonDeserialize;

/** Full catalog replacement. Availability is managed separately through the status endpoint. */
public record LabTestRequest(
        @JsonDeserialize(using = LabTestJson.Text.class) @NotBlank
        @Pattern(regexp = "[A-Z0-9][A-Z0-9_-]{0,29}") String code,
        @JsonDeserialize(using = LabTestJson.Text.class) @NotBlank @Size(max = 150) String name,
        @JsonDeserialize(using = LabTestJson.Text.class) @Size(max = 10000) String description,
        @JsonDeserialize(using = LabTestJson.Money.class) @NotNull @DecimalMin("0")
        @Digits(integer = 10, fraction = 2) BigDecimal price,
        @JsonDeserialize(using = LabTestJson.Text.class) @Pattern(regexp = "ILS") String currency,
        @JsonDeserialize(using = LabTestJson.Text.class) @NotBlank @Size(max = 40) String sampleType,
        @JsonDeserialize(using = LabTestJson.Text.class) @Size(max = 10000) String preparationInstructions) {
    public LabTestRequest {
        code = code == null ? null : code.strip().toUpperCase(Locale.ROOT);
        name = name == null ? null : name.strip();
        description = optional(description);
        currency = currency == null ? "ILS" : currency.strip();
        sampleType = sampleType == null ? null : sampleType.strip();
        preparationInstructions = optional(preparationInstructions);
    }

    private static String optional(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
