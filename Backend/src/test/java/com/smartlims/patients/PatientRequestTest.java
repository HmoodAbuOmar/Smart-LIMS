package com.smartlims.patients;

import com.smartlims.patients.dto.CreatePatientRequest;
import com.smartlims.patients.dto.UpdatePatientRequest;
import com.smartlims.patients.dto.PatientQueryRequest;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.exception.PatientValidationException;
import jakarta.validation.Validation;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PatientRequestTest {
    @Test
    void normalizationOccursBeforeLengthValidationAndBlankAddressBecomesNull() {
        var birth = LocalDate.of(2000, 1, 1);
        var create = new CreatePatientRequest("  " + "x".repeat(120) + "  ", birth,
                PatientGender.UNKNOWN, "  000001  ", " \t ");
        var update = new UpdatePatientRequest(" Example Patient ", birth,
                PatientGender.FEMALE, " 000001 ", " Example Address ");
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertTrue(factory.getValidator().validate(create).isEmpty());
            assertTrue(factory.getValidator().validate(update).isEmpty());
            assertFalse(factory.getValidator().validate(new CreatePatientRequest(" ", null, null, " ",
                    "x".repeat(501))).isEmpty());
            assertFalse(factory.getValidator().validate(new UpdatePatientRequest("x".repeat(121), birth,
                    PatientGender.UNKNOWN, "x".repeat(21), null)).isEmpty());
        }
        assertNull(create.address());
        assertEquals("000001", create.phoneNumber());
        assertEquals("Example Address", update.address());
    }

    @Test
    void queryDefaultsAndNormalizedValuesAreValidForDirectServiceCalls() {
        PatientQueryRequest defaults = PatientQueryRequest.fromQueryParameters(Map.of());
        assertEquals("", defaults.search());
        assertEquals(0, defaults.page());
        assertEquals(20, defaults.size());
        assertEquals("createdAt,desc", defaults.sort());
        PatientQueryRequest bounds = PatientQueryRequest.fromQueryParameters(Map.of(
                "search", List.of("  " + "x".repeat(120) + "  "),
                "page", List.of("2147483647"), "size", List.of("100"), "sort", List.of("fullName,asc")));
        assertEquals("x".repeat(120), bounds.search());
        assertEquals(Integer.MAX_VALUE, bounds.page());
        assertEquals(100, bounds.size());
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertTrue(factory.getValidator().validate(defaults).isEmpty());
            assertTrue(factory.getValidator().validate(bounds).isEmpty());
        }
    }

    @Test
    void queryConstructionRejectsInvalidValuesAndRepeatedKnownParameters() {
        for (String field : List.of("search", "page", "size", "sort")) {
            PatientValidationException error = assertThrows(PatientValidationException.class,
                    () -> PatientQueryRequest.fromQueryParameters(Map.of(field, List.of("0", "0"))));
            assertEquals(field, error.getField());
            assertEquals("Please correct the request fields.", error.getMessage());
        }
        assertEquals("search", assertThrows(PatientValidationException.class,
                () -> new PatientQueryRequest("x".repeat(121), 0, 20, "createdAt,desc")).getField());
        assertEquals("page", assertThrows(PatientValidationException.class,
                () -> new PatientQueryRequest("", -1, 20, "createdAt,desc")).getField());
        assertEquals("size", assertThrows(PatientValidationException.class,
                () -> new PatientQueryRequest("", 0, 101, "createdAt,desc")).getField());
        assertEquals("sort", assertThrows(PatientValidationException.class,
                () -> new PatientQueryRequest("", 0, 20, "id,asc")).getField());
        // Preserve first-error ordering when several query parameters are invalid.
        assertEquals("page", assertThrows(PatientValidationException.class,
                () -> PatientQueryRequest.fromQueryParameters(Map.of("page", List.of("-1"), "size", List.of("0")))).getField());
    }
}
