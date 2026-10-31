package com.smartlims.orders;

import com.smartlims.orders.dto.OrderQueryRequest;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.exception.OrderException;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OrderQueryRequestTest {
    @Test
    void defaultsTrimAndAllFourStatusesAreExact() {
        assertEquals(new OrderQueryRequest("", null, 0, 20, "createdAt,desc"), OrderQueryRequest.fromQueryParameters(Map.of()));
        assertEquals("ord-", OrderQueryRequest.fromQueryParameters(Map.of("search", List.of(" ord- "))).search());
        for (var status : OrderStatus.values())
            assertEquals(status,
                    OrderQueryRequest.fromQueryParameters(Map.of("status", List.of(status.name()))).status());
        for (String value : List.of("", "All", "pending", " PENDING", "PENDING ", "null", "PENDING,COMPLETED")) {
            assertEquals("status", assertThrows(OrderException.class,
                    () -> OrderQueryRequest.fromQueryParameters(Map.of("status", List.of(value)))).getField());
        }
    }

    @Test
    void rejectsRepetitionOfEverySupportedKeyAndIgnoresUnknownKeys() {
        for (String field : List.of("search", "status", "page", "size", "sort")) {
            for (var values : List.of(List.of("1", "1"), List.<String>of(), java.util.Arrays.asList((String) null)))
                assertEquals(field, assertThrows(OrderException.class,
                        () -> OrderQueryRequest.fromQueryParameters(Map.of(field, values))).getField());
        }
        assertEquals(OrderQueryRequest.fromQueryParameters(Map.of()),
                OrderQueryRequest.fromQueryParameters(Map.of("patientId", List.of("untrusted"))));
    }

    @Test
    void boundsAndNumericSyntaxAreValidatedWithoutOverflow() {
        for (String field : List.of("page", "size"))
            for (String value : List.of("", "-1", "+1", " 1", "1 ", "1.0", "2147483648", "null")) {
                assertEquals(field, assertThrows(OrderException.class,
                        () -> OrderQueryRequest.fromQueryParameters(Map.of(field, List.of(value)))).getField());
            }
        assertEquals(Integer.MAX_VALUE, OrderQueryRequest.fromQueryParameters(Map.of("page", List.of("2147483647"))).page());
        assertEquals(100, OrderQueryRequest.fromQueryParameters(Map.of("size", List.of("100"))).size());
        for (String value : List.of("0", "101"))
            assertEquals("size", assertThrows(OrderException.class,
                    () -> OrderQueryRequest.fromQueryParameters(Map.of("size", List.of(value)))).getField());
        assertEquals("search", assertThrows(OrderException.class, () -> new OrderQueryRequest("x".repeat(31), null, 0, 20, null)).getField());
    }

    @Test
    void acceptsOnlyDocumentedSortsAndDirections() {
        for (String field : List.of("orderNumber", "createdAt", "updatedAt"))
            for (String direction : List.of("asc", "desc"))
                assertEquals(field + "," + direction, new OrderQueryRequest(null, null, 0, 20, field + "," + direction).sort());
        for (String value : List.of("", "createdAt", "createdAt,DESC", "createdAt,desc ", "totalAmount,asc", "id,asc", "status,desc", "createdAt,desc,id,asc"))
            assertEquals("sort", assertThrows(OrderException.class, () -> new OrderQueryRequest(null, null, 0, 20, value)).getField());
    }
}
