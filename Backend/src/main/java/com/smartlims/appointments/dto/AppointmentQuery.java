package com.smartlims.appointments.dto;

import com.smartlims.appointments.exception.AppointmentException;

import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;

public record AppointmentQuery(Map<String, List<String>> values, int page, int size) {
    public static AppointmentQuery of(Map<String, List<String>> values, String... allowed) {
        Set<String> names = new HashSet<>(List.of(allowed));
        names.addAll(List.of("page", "size"));
        values.forEach((key, list) -> {
            if (!names.contains(key) || list == null || list.size() != 1 || list.getFirst() == null || list.getFirst().isEmpty())
                throw AppointmentException.invalid(key);
        });
        int page = integer(value(values, "page", "0"), "page");
        int size = integer(value(values, "size", "20"), "size");
        if (size < 1 || size > 100)
            throw AppointmentException.invalid("size");
        return new AppointmentQuery(values, page, size);
    }

    public String get(String key, String fallback) {
        return value(values, key, fallback);
    }

    public UUID uuid(String key) {
        return uuid(get(key, null), key);
    }

    public static UUID uuid(String value, String field) {
        if (value == null || !value.matches(AppointmentRequests.UUID_PATTERN))
            throw AppointmentException.invalid(field);
        return UUID.fromString(value);
    }

    public Instant[] range() {
        Instant from = instant(get("from", null), "from"), to = instant(get("to", null), "to");
        if (!to.isAfter(from) || Duration.between(from, to).compareTo(Duration.ofDays(31)) > 0)
            throw AppointmentException.invalid("to");
        return new Instant[]{from, to};
    }

    public static Instant instant(String value, String field) {
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})"))
            throw AppointmentException.invalid(field);
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException ex) {
            throw AppointmentException.invalid(field);
        }
    }

    public boolean bool(String field) {
        String value = get(field, "false");
        if (!value.equals("true") && !value.equals("false"))
            throw AppointmentException.invalid(field);
        return Boolean.parseBoolean(value);
    }

    private static String value(Map<String, List<String>> v, String k, String fallback) {
        return v.containsKey(k) ? v.get(k).getFirst() : fallback;
    }

    private static int integer(String value, String field) {
        if (!value.matches("[0-9]+"))
            throw AppointmentException.invalid(field);
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            throw AppointmentException.invalid(field);
        }
    }
}
