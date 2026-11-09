package com.smartlims.labtests;

import com.smartlims.labtests.dto.ReferenceRangeRequest;
import com.smartlims.labtests.dto.ReferenceRangeResponse;
import com.smartlims.labtests.entity.ReferenceRange;
import com.smartlims.labtests.entity.TestParameter;
import com.smartlims.laboratory.exception.LaboratoryException;
import jakarta.validation.Validation;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class ReferenceRangeRequestTest {
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void omittedNullAndBlankBoundsAreUnboundedAndOneSidedNegativeOrEqualLimitsAreAllowed() {
        for (String body : List.of(
                "{\"applicability\":\"ANY\",\"lowerLimit\":0}",
                "{\"applicability\":\"MALE\",\"lowerLimit\":null,\"upperLimit\":-1.25}",
                "{\"applicability\":\"FEMALE\",\"minAgeDays\":\" \",\"maxAgeDays\":null,\"lowerLimit\":-2,\"upperLimit\":\"\",\"validFrom\":\" \",\"validTo\":null}",
                "{\"applicability\":\"ANY\",\"minAgeDays\":0,\"maxAgeDays\":2147483647,\"lowerLimit\":1,\"upperLimit\":1,\"validFrom\":\" 2000-02-29 \",\"validTo\":\"9999-12-31\"}")) {
            var request = json.readValue(body, ReferenceRangeRequest.class);
            try (var factory = Validation.buildDefaultValidatorFactory()) {
                assertTrue(factory.getValidator().validate(request).isEmpty());
            }
            assertDoesNotThrow(request::validateBounds);
        }
    }

    @Test
    void rejectsCoercionAndFractionalOrOverflowAges() {
        for (String field : List.of("minAgeDays", "maxAgeDays", "lowerLimit", "upperLimit")) {
            for (String value : List.of("\"1\"", "true", "[]", "{}", "\"NaN\""))
                assertThrows(Exception.class, () -> json.readValue(
                        "{\"applicability\":\"ANY\",\"" + field + "\":" + value + "}", ReferenceRangeRequest.class));
        }
        for (String value : List.of("1.5", "2147483648"))
            assertThrows(Exception.class, () -> json.readValue(
                    "{\"applicability\":\"ANY\",\"minAgeDays\":" + value + "}", ReferenceRangeRequest.class));
        assertThrows(Exception.class, () -> json.readValue("{\"validFrom\":123}", ReferenceRangeRequest.class));
    }

    @Test
    void validatesExactApplicabilityNonnegativeAgesAndDecimalStoragePrecision() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            for (String extra : List.of("\"applicability\":\"any\"", "\"applicability\":\" ANY \"",
                    "\"applicability\":null", "\"minAgeDays\":-1", "\"maxAgeDays\":-1",
                    "\"lowerLimit\":0.0000000000001", "\"upperLimit\":100000000000000000000000000")) {
                // Supply each property only once, leaving unrelated fields valid.
                String body = extra.startsWith("\"applicability\"") ? "{" + extra + ",\"lowerLimit\":0}"
                        : "{\"applicability\":\"ANY\"," + extra + "}";
                assertFalse(factory.getValidator().validate(json.readValue(body, ReferenceRangeRequest.class)).isEmpty());
            }
        }
    }

    @Test
    void rejectsMissingLimitsReversedOrEmptyIntervalsAndInvalidCalendarDates() {
        for (String[] value : List.of(
                new String[]{"", "lowerLimit"},
                new String[]{",\"lowerLimit\":2,\"upperLimit\":1", "upperLimit"},
                new String[]{",\"lowerLimit\":0,\"minAgeDays\":2,\"maxAgeDays\":2", "maxAgeDays"},
                new String[]{",\"lowerLimit\":0,\"minAgeDays\":3,\"maxAgeDays\":2", "maxAgeDays"},
                new String[]{",\"lowerLimit\":0,\"validFrom\":\"2030-01-01\",\"validTo\":\"2030-01-01\"", "validTo"},
                new String[]{",\"lowerLimit\":0,\"validFrom\":\"2031-01-01\",\"validTo\":\"2030-01-01\"", "validTo"})) {
            var request = json.readValue("{\"applicability\":\"ANY\"" + value[0] + "}", ReferenceRangeRequest.class);
            assertEquals(value[1], assertThrows(LaboratoryException.class, request::validateBounds).getField());
        }
        for (String date : List.of("2030-02-29", "2030-1-01", "0000-01-01", "2030-01-01T00:00:00Z", "+10000-01-01")) {
            var request = new ReferenceRangeRequest("ANY", null, null, BigDecimal.ZERO, null, date, null);
            assertEquals("validFrom", assertThrows(LaboratoryException.class, request::validateBounds).getField());
        }
    }

    @Test
    void classifiesHalfOpenDatesAgainstOneExplicitClassificationDate() {
        var today = LocalDate.of(2030, 1, 2);
        var parameter = mock(TestParameter.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);
        var current = new ReferenceRange(parameter, ReferenceRange.Applicability.ANY, null, null, BigDecimal.ZERO, null, today, today.plusDays(1));
        var expired = new ReferenceRange(parameter, ReferenceRange.Applicability.ANY, null, null, BigDecimal.ZERO, null, null, today);
        var future = new ReferenceRange(parameter, ReferenceRange.Applicability.ANY, null, null, BigDecimal.ZERO, null, today.plusDays(1), null);
        var unbounded = new ReferenceRange(parameter, ReferenceRange.Applicability.ANY, null, null, BigDecimal.ZERO, null, null, null);
        assertEquals(ReferenceRangeResponse.Status.CURRENT, ReferenceRangeResponse.from(current, today).status());
        assertEquals(ReferenceRangeResponse.Status.EXPIRED, ReferenceRangeResponse.from(expired, today).status());
        assertEquals(ReferenceRangeResponse.Status.FUTURE, ReferenceRangeResponse.from(future, today).status());
        assertEquals(ReferenceRangeResponse.Status.CURRENT, ReferenceRangeResponse.from(unbounded, today).status());
        assertEquals(today, ReferenceRangeResponse.from(future, today).classificationDate());
    }
}
