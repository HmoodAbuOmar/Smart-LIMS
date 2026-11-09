package com.smartlims.labtests.dto;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

public final class LabTestJson {
    private LabTestJson() {
    }

    public static class Text extends ValueDeserializer<String> {
        @Override
        public String deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_STRING))
                return (String) context.handleUnexpectedToken(String.class, parser);
            return parser.getString();
        }
    }

    public static class Money extends ValueDeserializer<BigDecimal> {
        @Override
        public BigDecimal deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT) && !parser.hasToken(JsonToken.VALUE_NUMBER_FLOAT))
                return (BigDecimal) context.handleUnexpectedToken(BigDecimal.class, parser);
            return parser.getDecimalValue();
        }
    }

    public static class Categories extends ValueDeserializer<List<String>> {
        @Override
        public List<String> deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.START_ARRAY)) {
                context.handleUnexpectedToken(List.class, parser);
                return null;
            }
            List<String> values = new ArrayList<>();
            while (parser.nextToken() != JsonToken.END_ARRAY) {
                if (parser.hasToken(JsonToken.VALUE_NULL))
                    values.add(null);
                else if (parser.hasToken(JsonToken.VALUE_STRING))
                    values.add(parser.getString());
                else {
                    context.handleUnexpectedToken(String.class, parser);
                    return null;
                }
            }
            return values;
        }
    }

    public static class BooleanValue extends ValueDeserializer<Boolean> {
        @Override
        public Boolean deserialize(JsonParser parser, DeserializationContext context) {
            if (parser.hasToken(JsonToken.VALUE_TRUE))
                return true;
            if (parser.hasToken(JsonToken.VALUE_FALSE))
                return false;
            return (Boolean) context.handleUnexpectedToken(Boolean.class, parser);
        }
    }
}
