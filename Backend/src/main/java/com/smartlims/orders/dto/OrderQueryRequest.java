package com.smartlims.orders.dto;

import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.exception.OrderException;

import java.util.List;
import java.util.Map;

public record OrderQueryRequest(String search, OrderStatus status, int page, int size, String sort) {
    public OrderQueryRequest {
        search = search == null ? "" : search.strip();
        sort = sort == null ? "createdAt,desc" : sort;
        if (search.length() > 30)
            throw OrderException.invalid("search");
        if (page < 0)
            throw OrderException.invalid("page");
        if (size < 1 || size > 100)
            throw OrderException.invalid("size");
        if (!sort.matches("(orderNumber|createdAt|updatedAt),(asc|desc)"))
            throw OrderException.invalid("sort");
    }

    public static OrderQueryRequest fromQueryParameters(Map<String, List<String>> query) {
        return new OrderQueryRequest(single(query, "search", ""), status(single(query, "status", null)),
                integer(single(query, "page", "0"), "page"), integer(single(query, "size", "20"), "size"),
                single(query, "sort", "createdAt,desc"));
    }

    private static OrderStatus status(String value) {
        if (value == null)
            return null;
        try {
            return OrderStatus.valueOf(value);
        } catch (IllegalArgumentException error) {
            throw OrderException.invalid("status");
        }
    }

    private static String single(Map<String, List<String>> query, String field, String fallback) {
        List<String> values = query.get(field);
        if (values == null)
            return fallback;
        if (values.size() != 1 || values.getFirst() == null)
            throw OrderException.invalid(field);
        return values.getFirst();
    }

    private static int integer(String value, String field) {
        if (!value.matches("[0-9]+"))
            throw OrderException.invalid(field);
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            throw OrderException.invalid(field);
        }
    }
}
