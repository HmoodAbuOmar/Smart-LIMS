package com.smartlims.laboratory.dto;

import com.smartlims.laboratory.exception.LaboratoryException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

import tools.jackson.core.*;
import tools.jackson.databind.*;

public final class LaboratoryInput {
    private LaboratoryInput() {
    }

    public static final String UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    public static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }

    public static UUID uuid(String text, String field) {
        if (text == null || !text.matches(UUID_PATTERN))
            throw LaboratoryException.invalid(field);
        return UUID.fromString(text);
    }

    public static UUID key(List<String> keys) {
        if (keys == null || keys.size() != 1)
            throw LaboratoryException.invalid("idempotencyKey");
        return uuid(keys.getFirst(), "idempotencyKey");
    }

    public static List<UUID> ids(List<String> text, String field, int minimum, int maximum) {
        if (text == null || text.size() < minimum || text.size() > maximum)
            throw LaboratoryException.invalid(field);
        var ids = text.stream().map(t -> uuid(t, field)).toList();
        if (new HashSet<>(ids).size() != ids.size())
            throw LaboratoryException.invalid(field);
        return ids;
    }

    public static Instant time(String text, String field) {
        if (text == null || !text.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})"))
            throw LaboratoryException.invalid(field);
        try {
            return OffsetDateTime.parse(text).toInstant();
        } catch (DateTimeException e) {
            throw LaboratoryException.invalid(field);
        }
    }

    public static String optional(String text) {
        return text == null || text.isBlank() ? null : text.strip();
    }

    public static String text(String text, String field, int max, boolean required) {
        text = optional(text);
        if ((required && text == null) || (text != null && (text.length() > max || text.codePoints().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t'))))
            throw LaboratoryException.invalid(field);
        return text;
    }

    public static String hash(Object... values) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            for (Object v : values) {
                String s = String.valueOf(v);
                digest.update((s.getBytes(StandardCharsets.UTF_8).length + ":").getBytes(StandardCharsets.UTF_8));
                digest.update(s.getBytes(StandardCharsets.UTF_8));
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static class Text extends ValueDeserializer<String> {
        @Override
        public String deserialize(JsonParser p, DeserializationContext c) {
            return p.hasToken(JsonToken.VALUE_STRING) ? p.getString() : (String) c.handleUnexpectedToken(String.class, p);
        }
    }

    public static class BooleanValue extends ValueDeserializer<Boolean> {
        @Override
        public Boolean deserialize(JsonParser p, DeserializationContext c) {
            if (p.hasToken(JsonToken.VALUE_TRUE))
                return true;
            if (p.hasToken(JsonToken.VALUE_FALSE))
                return false;
            return (Boolean) c.handleUnexpectedToken(Boolean.class, p);
        }
    }

    public static class IntegerValue extends ValueDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser p, DeserializationContext c) {
            return p.hasToken(JsonToken.VALUE_NUMBER_INT) ? p.getIntValue() : (Integer) c.handleUnexpectedToken(Integer.class, p);
        }
    }

    public static class LongValue extends ValueDeserializer<Long> {
        @Override
        public Long deserialize(JsonParser p, DeserializationContext c) {
            return p.hasToken(JsonToken.VALUE_NUMBER_INT) ? p.getLongValue() : (Long) c.handleUnexpectedToken(Long.class, p);
        }
    }

    public static class Decimal extends ValueDeserializer<BigDecimal> {
        @Override
        public BigDecimal deserialize(JsonParser p, DeserializationContext c) {
            return p.hasToken(JsonToken.VALUE_NUMBER_INT) || p.hasToken(JsonToken.VALUE_NUMBER_FLOAT) ? p.getDecimalValue() : (BigDecimal) c.handleUnexpectedToken(BigDecimal.class, p);
        }
    }

    public static class Ids extends ValueDeserializer<List<String>> {
        @Override
        public List<String> deserialize(JsonParser p, DeserializationContext c) {
            if (!p.hasToken(JsonToken.START_ARRAY))
                return (List<String>) c.handleUnexpectedToken(List.class, p);
            List<String> values = new ArrayList<>();
            while (p.nextToken() != JsonToken.END_ARRAY) {
                if (!p.hasToken(JsonToken.VALUE_STRING)) {
                    c.handleUnexpectedToken(String.class, p);
                    return null;
                }
                values.add(p.getString());
            }
            return values;
        }
    }
}
