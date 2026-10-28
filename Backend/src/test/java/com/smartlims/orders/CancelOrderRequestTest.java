package com.smartlims.orders;

import com.smartlims.orders.dto.CancelOrderRequest;
import jakarta.validation.Validation;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class CancelOrderRequestTest {
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void optionalReasonsNormalizeNullBlankAndWhitespace() {
        for (String body : List.of("{}", "{\"reason\":null}", "{\"reason\":\"\"}", "{\"reason\":\" \\t\\n \"}"))
            assertNull(json.readValue(body, CancelOrderRequest.class).reason());
        assertEquals("Synthetic reason", new CancelOrderRequest(" \tSynthetic reason\n ").reason());
    }

    @Test
    void trimmedReasonsAreBoundedToOneThousandCharacters() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertTrue(factory.getValidator().validate(new CancelOrderRequest(" " + "a".repeat(1000) + " ")).isEmpty());
            var violations = factory.getValidator().validate(new CancelOrderRequest("a".repeat(1001)));
            assertEquals("reason", violations.iterator().next().getPropertyPath().toString());
        }
    }

    @Test
    void reasonRejectsNonStringJsonRatherThanCoercingIt() {
        for (String value : List.of("1", "true", "{}", "[]"))
            assertThrows(Exception.class, () -> json.readValue("{\"reason\":" + value + "}", CancelOrderRequest.class));
    }
}
