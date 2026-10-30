package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.patients.dto.UpdatePatientRequest;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.service.PatientService;
import com.smartlims.results.dto.ResultRequests;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PatientProfileSnapshotTest extends LaboratoryTestSupport {
    @Autowired PatientService patientService;

    @Test void selfProfileEditPreservesCurrentAndSupersededPublishedPatientSnapshots() throws Exception {
        var prepared = prepared(create(own, first)); var original = publish(prepared.result());
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), original.id().toString(),
                new ResultRequests.Correction("Synthetic correction"), List.of(UUID.randomUUID().toString())).result();
        var current = publish(correction);
        var accountBefore = jdbc.queryForMap("SELECT * FROM users WHERE id=?", actors.get(Role.PATIENT).getId());
        var snapshotsBefore = jdbc.queryForList("SELECT id,patient_name_snapshot,patient_number_snapshot,birth_date_snapshot,specimen_snapshots FROM test_results ORDER BY id");
        var profile = patientService.updateMyProfile(actor(Role.PATIENT), new UpdatePatientRequest("New synthetic patient name",
                LocalDate.of(2001, 2, 3), PatientGender.FEMALE, "000002", "New address"));
        assertEquals("New synthetic patient name", profile.fullName()); assertEquals(100, profile.completionPercentage());
        assertEquals(accountBefore, jdbc.queryForMap("SELECT * FROM users WHERE id=?", actors.get(Role.PATIENT).getId()));
        assertEquals(snapshotsBefore, jdbc.queryForList("SELECT id,patient_name_snapshot,patient_number_snapshot,birth_date_snapshot,specimen_snapshots FROM test_results ORDER BY id"));
        for (var result : List.of(original, current)) {
            mvc.perform(bearer(get("/api/results/me/" + result.id()), Role.PATIENT)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.patient.name").value(result.patient().name()))
                    .andExpect(jsonPath("$.patient.dateOfBirth").value(result.patient().dateOfBirth().toString()));
        }
    }
}
