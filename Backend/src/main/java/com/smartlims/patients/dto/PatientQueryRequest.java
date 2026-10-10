package com.smartlims.patients.dto;

import com.smartlims.patients.exception.PatientValidationException;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

public record PatientQueryRequest(
        @Size(max = 120) String search,
        @Min(0) int page,
        @Min(1) @Max(100) int size,
        @NotNull @Pattern(regexp = SORT_PATTERN) String sort) {
    private static final String SORT_PATTERN = "(patientNumber|fullName|dateOfBirth|createdAt|updatedAt),(asc|desc)";

    public PatientQueryRequest {
        search = search == null ? "" : search.strip();
        sort = sort == null ? "createdAt,desc" : sort;
        // Guard construction as well as Bean Validation, preserving the existing query error messages.
        if (page < 0) throw new PatientValidationException("page");
        if (size < 1 || size > 100) throw new PatientValidationException("size");
        if (search.length() > 120) throw new PatientValidationException("search");
        if (!sort.matches(SORT_PATTERN)) throw new PatientValidationException("sort");
    }

    public static PatientQueryRequest fromQueryParameters(Map<String, List<String>> parameters) {
        // Read in the existing order so requests with multiple invalid fields retain their first error.
        int page = integer(single(parameters, "page", "0"), "page", 0, Integer.MAX_VALUE);
        int size = integer(single(parameters, "size", "20"), "size", 1, 100);
        String search = single(parameters, "search", "").strip();
        if (search.length() > 120) throw new PatientValidationException("search");
        return new PatientQueryRequest(search, page, size, single(parameters, "sort", "createdAt,desc"));
    }

    private static String single(Map<String, List<String>> parameters, String field, String fallback) {
        List<String> values = parameters.get(field);
        if (values == null) return fallback;
        if (values.size() != 1 || values.getFirst() == null) throw new PatientValidationException(field);
        return values.getFirst();
    }

    private static int integer(String value, String field, int min, int max) {
        try {
            if (!value.matches("[0-9]+")) throw new PatientValidationException(field);
            int number = Integer.parseInt(value);
            if (number < min || number > max) throw new PatientValidationException(field);
            return number;
        } catch (NumberFormatException error) { throw new PatientValidationException(field); }
    }
}
