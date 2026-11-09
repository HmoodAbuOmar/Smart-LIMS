package com.smartlims.auth.dto;

import com.smartlims.auth.entity.AccountStatus;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.service.AuthRequestException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

public record UserQueryRequest(String search, Role role, AccountStatus status, Instant createdFrom,
                                Instant createdTo, int page, int size, String sort) {
    private static final Set<String> FIELDS = Set.of("search", "role", "status", "createdFrom", "createdTo", "page", "size", "sort");

    public UserQueryRequest {
        search = search == null ? "" : search.strip();
        sort = sort == null ? "fullName,asc" : sort;
        if (search.length() > 120) throw invalid("search");
        if (page < 0) throw invalid("page");
        if (size < 1 || size > 100) throw invalid("size");
        if (!sort.matches("(fullName|role|status|lastLoginAt),(asc|desc)")) throw invalid("sort");
        if (createdFrom != null && createdTo != null && !createdFrom.isBefore(createdTo)) throw invalid("createdTo");
    }

    public static UserQueryRequest from(Map<String, List<String>> parameters) {
        parameters.forEach((key, values) -> {
            if (!FIELDS.contains(key) || values == null || values.size() != 1 || values.getFirst() == null)
                throw invalid(key);
        });
        return new UserQueryRequest(single(parameters, "search", ""),
                enumeration(parameters, "role", Role.class), enumeration(parameters, "status", AccountStatus.class),
                timestamp(parameters, "createdFrom"), timestamp(parameters, "createdTo"),
                integer(single(parameters, "page", "0"), "page"),
                integer(single(parameters, "size", "20"), "size"), single(parameters, "sort", "fullName,asc"));
    }

    private static String single(Map<String, List<String>> values, String key, String fallback) {
        return values.containsKey(key) ? values.get(key).getFirst() : fallback;
    }

    private static int integer(String value, String field) {
        try {
            if (!value.matches("[0-9]+")) throw invalid(field);
            return Integer.parseInt(value);
        } catch (NumberFormatException error) { throw invalid(field); }
    }

    private static <E extends Enum<E>> E enumeration(Map<String, List<String>> values, String key, Class<E> type) {
        if (!values.containsKey(key)) return null;
        try { return Enum.valueOf(type, single(values, key, "")); }
        catch (IllegalArgumentException error) { throw invalid(key); }
    }

    private static Instant timestamp(Map<String, List<String>> values, String key) {
        if (!values.containsKey(key)) return null;
        try { return OffsetDateTime.parse(single(values, key, "")).toInstant(); }
        catch (DateTimeParseException error) { throw invalid(key); }
    }

    public static AuthRequestException invalid(String field) {
        return new AuthRequestException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid value.", field);
    }
}
