package com.smartlims.patients.dto;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

// Restrict coercion only for this module; existing authentication JSON behavior stays unchanged.
public final class PatientJson {
    private PatientJson() {}

    public static class Text extends ValueDeserializer<String> {
        @Override
        public String deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_STRING)) {
                return (String) context.handleUnexpectedToken(String.class, parser);
            }
            return parser.getString();
        }
    }

    public static class BirthDate extends ValueDeserializer<LocalDate> {
        @Override
        public LocalDate deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_STRING)) {
                return (LocalDate) context.handleUnexpectedToken(LocalDate.class, parser);
            }
            String value = parser.getString();
            if (value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) {
                try { return LocalDate.parse(value); }
                catch (DateTimeParseException ignored) { /* Report the same sanitized body error. */ }
            }
            return (LocalDate) context.handleWeirdStringValue(LocalDate.class, value, "Expected a valid ISO date.");
        }
    }
}
