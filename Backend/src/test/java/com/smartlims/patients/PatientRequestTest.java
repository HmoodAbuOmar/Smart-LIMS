package com.smartlims.patients;

import com.smartlims.patients.dto.CreatePatientRequest;
import com.smartlims.patients.dto.UpdatePatientRequest;
import com.smartlims.patients.entity.PatientGender;
import jakarta.validation.Validation;
import java.time.LocalDate;
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
}
