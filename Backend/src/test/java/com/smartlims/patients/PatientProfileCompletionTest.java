package com.smartlims.patients;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.patients.entity.*;
import com.smartlims.patients.mapper.PatientMapper;

import java.time.*;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PatientProfileCompletionTest {
    private final PatientMapper mapper = new PatientMapper();
    private final UserAccount account = UserAccount.registerPatient("Independent Account Name", "synthetic@example.invalid", "test-only-unused-hash");

    private Patient patient() {
        return new Patient("SYNTHETIC", account, "Synthetic Patient", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null);
    }

    @Test
    void unknownGenderAndAbsentOrBlankAddressRemainComplete() {
        var patient = patient();
        assertEquals(100, mapper.toSelfProfile(patient, account).completionPercentage());
        assertEquals(List.of(), mapper.toSelfProfile(patient, account).missingFields());
        patient.setAddress("  ");
        assertEquals(100, mapper.toSelfProfile(patient, account).completionPercentage());
        patient.setAddress("Synthetic address");
        assertEquals(100, mapper.toSelfProfile(patient, account).completionPercentage());
    }

    @Test
    void everyRequiredFieldContributesExactlyTwentyPointsWithoutAccountDemographicFallback() {
        for (String field : List.of("fullName", "dateOfBirth", "gender", "phoneNumber", "email")) {
            var patient = patient();
            var user = account;
            switch (field) {
                case "fullName" -> patient.setFullName(" \t ");
                case "dateOfBirth" -> patient.setDateOfBirth(null);
                case "gender" -> patient.setGender(null);
                case "phoneNumber" -> patient.setPhoneNumber(null);
                case "email" -> user = UserAccount.registerPatient("Account Name", " ", "test-only-unused-hash");
            }
            var view = mapper.toSelfProfile(patient, user);
            assertEquals(80, view.completionPercentage(), field);
            assertEquals(List.of(field), view.missingFields());
        }
    }

    @Test
    void allMissingFieldsProduceZeroInDeterministicOrder() {
        // In-memory projection fixture only: the actual schema prevents incomplete profile creation.
        var patient = new Patient("SYNTHETIC", account, null, null, null, " ", "Optional address");
        var user = UserAccount.registerPatient("Account Name", null, "test-only-unused-hash");
        var view = mapper.toSelfProfile(patient, user);
        assertEquals(0, view.completionPercentage());
        assertEquals(List.of("fullName", "dateOfBirth", "gender", "phoneNumber", "email"), view.missingFields());
    }

    @Test
    void futureDateIsIncompleteWhileJerusalemTodayIsValid() {
        var patient = patient();
        var today = LocalDate.now(ZoneId.of("Asia/Jerusalem"));
        patient.setDateOfBirth(today.plusDays(1));
        assertEquals(80, mapper.toSelfProfile(patient, account).completionPercentage());
        assertEquals(List.of("dateOfBirth"), mapper.toSelfProfile(patient, account).missingFields());
        patient.setDateOfBirth(today);
        assertEquals(100, mapper.toSelfProfile(patient, account).completionPercentage());
    }

    @Test
    void completionMissingFieldsAreImmutableAndNoSensitiveAccountFieldsAreMapped() {
        var patient = patient();
        patient.setPhoneNumber(null);
        var view = mapper.toSelfProfile(patient, account);
        assertThrows(UnsupportedOperationException.class, () -> view.missingFields().add("address"));
        assertFalse(view.emailEditable());
        assertEquals(account.getEmail(), view.email());
    }
}
