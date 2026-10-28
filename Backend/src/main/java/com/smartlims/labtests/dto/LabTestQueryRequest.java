package com.smartlims.labtests.dto;

import com.smartlims.labtests.entity.LabTestCategory;
import com.smartlims.labtests.exception.LabTestException;
import java.util.List;
import java.util.Map;

public record LabTestQueryRequest(String search, Boolean active, int page, int size, String sort,
        LabTestCategory category) {
    public LabTestQueryRequest {
        search = search == null ? "" : search.strip();
        sort = sort == null ? "name,asc" : sort;
        if (search.length() > 150) throw LabTestException.invalid("search");
        if (page < 0) throw LabTestException.invalid("page");
        if (size < 1 || size > 100) throw LabTestException.invalid("size");
        if (!sort.matches("(code|name|price|createdAt|updatedAt),(asc|desc)"))
            throw LabTestException.invalid("sort");
    }

    public static LabTestQueryRequest fromQueryParameters(Map<String, List<String>> query) {
        String active = single(query, "active", null);
        if (active != null && !active.equals("true") && !active.equals("false"))
            throw LabTestException.invalid("active");
        return new LabTestQueryRequest(single(query, "search", ""),
                active == null ? null : Boolean.valueOf(active),
                integer(single(query, "page", "0"), "page"),
                integer(single(query, "size", "20"), "size"), single(query, "sort", "name,asc"),
                category(single(query, "category", null)));
    }

    private static LabTestCategory category(String value) {
        if (value == null) return null;
        try { return LabTestCategory.valueOf(value); }
        catch (IllegalArgumentException error) { throw LabTestException.invalid("category"); }
    }

    private static String single(Map<String, List<String>> query, String field, String fallback) {
        List<String> values = query.get(field);
        if (values == null) return fallback;
        if (values.size() != 1 || values.getFirst() == null) throw LabTestException.invalid(field);
        return values.getFirst();
    }

    private static int integer(String value, String field) {
        if (!value.matches("[0-9]+")) throw LabTestException.invalid(field);
        try { return Integer.parseInt(value); }
        catch (NumberFormatException error) { throw LabTestException.invalid(field); }
    }
}
