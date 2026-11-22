package com.smartlims.labtests.dto;

import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import tools.jackson.core.*;
import tools.jackson.databind.*;
import tools.jackson.databind.annotation.JsonDeserialize;

public record ReferenceRangeRequest(
        @JsonDeserialize(using = LaboratoryInput.Text.class) @NotNull @Pattern(regexp = "MALE|FEMALE|ANY") String applicability,
        @JsonDeserialize(using = OptionalAge.class) @PositiveOrZero Integer minAgeDays,
        @JsonDeserialize(using = OptionalAge.class) @PositiveOrZero Integer maxAgeDays,
        @JsonDeserialize(using = OptionalLimit.class) @Digits(integer = 26, fraction = 12) BigDecimal lowerLimit,
        @JsonDeserialize(using = OptionalLimit.class) @Digits(integer = 26, fraction = 12) BigDecimal upperLimit,
        @JsonDeserialize(using = LaboratoryInput.Text.class) String validFrom,
        @JsonDeserialize(using = LaboratoryInput.Text.class) String validTo) {

    public ReferenceRangeRequest {
        validFrom = LaboratoryInput.optional(validFrom);
        validTo = LaboratoryInput.optional(validTo);
    }

    public void validateBounds() {
        if (lowerLimit == null && upperLimit == null)
            throw LaboratoryException.invalid("lowerLimit");
        if (lowerLimit != null && upperLimit != null && lowerLimit.compareTo(upperLimit) > 0)
            throw LaboratoryException.invalid("upperLimit");
        if (minAgeDays != null && maxAgeDays != null && minAgeDays >= maxAgeDays)
            throw LaboratoryException.invalid("maxAgeDays");
        var from = fromDate();
        var to = toDate();
        if (from != null && to != null && !from.isBefore(to))
            throw LaboratoryException.invalid("validTo");
    }

    public LocalDate fromDate() {
        return date(validFrom, "validFrom");
    }

    public LocalDate toDate() {
        return date(validTo, "validTo");
    }

    private static LocalDate date(String value, String field) {
        if (value == null)
            return null;
        try {
            if (!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))
                throw LaboratoryException.invalid(field);
            var date = LocalDate.parse(value);
            if (date.getYear() == 0)
                throw LaboratoryException.invalid(field);
            return date;
        } catch (DateTimeParseException e) {
            throw LaboratoryException.invalid(field);
        }
    }

    // Blank UI bounds are unbounded; nonblank numeric strings are never coerced.
    public static class OptionalAge extends ValueDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser p, DeserializationContext c) {
            if (p.hasToken(JsonToken.VALUE_STRING) && p.getString().isBlank())
                return null;
            return p.hasToken(JsonToken.VALUE_NUMBER_INT) ? p.getIntValue() : (Integer) c.handleUnexpectedToken(Integer.class, p);
        }
    }

    public static class OptionalLimit extends ValueDeserializer<BigDecimal> {
        @Override
        public BigDecimal deserialize(JsonParser p, DeserializationContext c) {
            if (p.hasToken(JsonToken.VALUE_STRING) && p.getString().isBlank())
                return null;
            return p.hasToken(JsonToken.VALUE_NUMBER_INT) || p.hasToken(JsonToken.VALUE_NUMBER_FLOAT)
                    ? p.getDecimalValue() : (BigDecimal) c.handleUnexpectedToken(BigDecimal.class, p);
        }
    }
}
