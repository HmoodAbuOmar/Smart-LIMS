package com.smartlims.labtests;

import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.exception.LabTestException;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class LabTestRequestTest {
    private static final String BODY = """
            {"code":" cbc ","name":" Complete blood count ","price":25.50,
             "sampleType":" Blood ","description":" ","preparationInstructions":" None "}
            """;
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void normalizesStringsAndDefaultsCurrencyWithoutRoundingMoney() {
        LabTestRequest request = json.readValue(BODY, LabTestRequest.class);
        assertEquals("CBC", request.code());
        assertEquals("Complete blood count", request.name());
        assertEquals("Blood", request.sampleType());
        assertEquals("None", request.preparationInstructions());
        assertNull(request.description());
        assertEquals("ILS", request.currency());
        assertEquals(new BigDecimal("25.50"), request.price());
    }

    @Test
    void rejectsNegativeOverprecisionAndOversizeMoneyAndInvalidCatalogFields() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertTrue(validator.validate(json.readValue(BODY, LabTestRequest.class)).isEmpty());
            for (String price : List.of("-0.01", "1.001", "10000000000")) {
                var request = json.readValue(BODY.replace("25.50", price), LabTestRequest.class);
                assertTrue(validator.validate(request).stream().anyMatch(v -> v.getPropertyPath().toString().equals("price")));
            }
            for (String body : List.of(BODY.replace(" cbc ", "bad code"), BODY.replace(" Blood ", " "),
                    BODY.replace(" Complete blood count ", " "), BODY.replace("25.50", "null"),
                    BODY.replace("\"price\":25.50", "\"currency\":\"USD\",\"price\":25.50"))) {
                assertFalse(validator.validate(json.readValue(body, LabTestRequest.class)).isEmpty());
            }
            assertFalse(validator.validate(new LabTestStatusRequest(null)).isEmpty());
        }
    }

    @Test
    void refusesJsonScalarCoercion() {
        for (String body : List.of(BODY.replace("25.50", "\"25.50\""), BODY.replace("\" cbc \"", "123"),
                BODY.replace("25.50", "true"), BODY.replace("25.50", "\"NaN\""))) {
            assertThrows(Exception.class, () -> json.readValue(body, LabTestRequest.class));
        }
        for (String value : List.of("\"true\"", "1", "[]", "{}")) {
            assertThrows(Exception.class, () -> json.readValue("{\"active\":" + value + "}", LabTestStatusRequest.class));
        }
        assertEquals(Boolean.FALSE, json.readValue("{\"active\":false}", LabTestStatusRequest.class).active());
    }

    @Test
    void validatesBoundedPaginationAndSortAndRepeatedFilters() {
        var defaults = LabTestQueryRequest.fromQueryParameters(Map.of());
        assertEquals(0, defaults.page());
        assertEquals(20, defaults.size());
        assertEquals("name,asc", defaults.sort());
        assertNull(defaults.active());
        for (var query : List.of(Map.of("size", List.of("0")), Map.of("size", List.of("101")),
                Map.of("page", List.of("-1")), Map.of("page", List.of("9999999999999")),
                Map.of("sort", List.of("description,asc")), Map.of("sort", List.of("name,ASC")),
                Map.of("active", List.of("1")), Map.of("search", List.of("a", "b")),
                Map.of("search", List.of("x".repeat(151))))) {
            assertThrows(LabTestException.class, () -> LabTestQueryRequest.fromQueryParameters(query));
        }
    }
}
