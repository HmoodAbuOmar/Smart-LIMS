package com.smartlims.orders;

import com.smartlims.orders.dto.CreateSelfOrderRequest;
import com.smartlims.orders.dto.CreateStaffOrderRequest;
import jakarta.validation.Validation;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class OrderRequestTest {
    private final JsonMapper json = JsonMapper.builder().build();
    private static final String ID = "abcdefab-1234-4567-89ab-abcdefabcdef";

    @Test
    void validatesCanonicalUniqueSelectionsAndTheOneToOneHundredBoundWithoutSilentDeduplication() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertTrue(validator.validate(new CreateSelfOrderRequest(List.of(ID))).isEmpty());
            assertTrue(validator.validate(new CreateSelfOrderRequest(List.of(ID.toUpperCase()))).isEmpty());
            var hundred = IntStream.range(0, 100).mapToObj(i -> UUID.randomUUID().toString()).toList();
            assertTrue(validator.validate(new CreateSelfOrderRequest(hundred)).isEmpty());
            List<List<String>> invalid = new ArrayList<>(List.of(List.of(), Arrays.asList((String) null),
                    List.of(""), List.of(" "), List.of("1-1-1-1-1"), List.of(" " + ID), List.of(ID + " "),
                    List.of(ID, ID.toUpperCase()), IntStream.range(0, 101).mapToObj(i -> UUID.randomUUID().toString()).toList()));
            invalid.add(null);
            for (List<String> values : invalid) {
                assertEquals("testIds", validator.validate(new CreateSelfOrderRequest(values)).iterator().next().getPropertyPath().toString());
            }
        }
    }

    @Test
    void validatesStaffPatientIdentityWithoutTrimmingOrUuidShortening() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertTrue(validator.validate(new CreateStaffOrderRequest(ID.toUpperCase(), List.of(ID))).isEmpty());
            for (String invalid : Arrays.asList(null, "", " ", "1-1-1-1-1", " " + ID, ID + " ", "not-a-uuid")) {
                assertEquals("patientId", validator.validate(new CreateStaffOrderRequest(invalid, List.of(ID)))
                        .iterator().next().getPropertyPath().toString());
            }
        }
    }

    @Test
    void refusesScalarCoercionWrongContainersAndNonStringElements() {
        for (String value : List.of("1", "true", "{}", "\"" + ID + "\"", "[1]", "[true]", "[{}]", "[[]]")) {
            assertThrows(Exception.class, () -> json.readValue("{\"testIds\":" + value + "}", CreateSelfOrderRequest.class));
        }
        for (String value : List.of("1", "true", "{}", "[]")) {
            assertThrows(Exception.class, () -> json.readValue("{\"patientId\":" + value + ",\"testIds\":[\"" + ID + "\"]}", CreateStaffOrderRequest.class));
        }
        assertNull(json.readValue("{\"testIds\":null}", CreateSelfOrderRequest.class).testIds());
        assertNull(json.readValue("{\"testIds\":[null]}", CreateSelfOrderRequest.class).testIds().getFirst());
    }

    @Test
    void defensiveCopiesPreserveInvalidNullsForValidation() {
        List<String> source = new ArrayList<>(Arrays.asList(ID, null));
        var self = new CreateSelfOrderRequest(source);
        var staff = new CreateStaffOrderRequest(ID, source);
        source.clear();
        assertEquals(2, self.testIds().size());
        assertEquals(2, staff.testIds().size());
        assertThrows(UnsupportedOperationException.class, () -> self.testIds().clear());
    }
}
