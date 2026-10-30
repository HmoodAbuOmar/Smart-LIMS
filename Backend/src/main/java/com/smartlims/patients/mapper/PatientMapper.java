package com.smartlims.patients.mapper;

import com.smartlims.patients.dto.PatientPageResponse;
import com.smartlims.patients.dto.PatientResponse;
import com.smartlims.patients.dto.PatientSelfProfileResponse;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.patients.entity.Patient;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Component;

@Component
public class PatientMapper {
    public PatientSelfProfileResponse toSelfProfile(Patient patient, UserAccount account) {
        var missing = new ArrayList<String>();
        if (blank(patient.getFullName())) missing.add("fullName");
        if (patient.getDateOfBirth() == null || patient.getDateOfBirth().isAfter(LocalDate.now(ZoneId.of("Asia/Jerusalem")))) {
            missing.add("dateOfBirth");
        }
        // UNKNOWN is a supported explicit choice; completion must not demand an invented gender.
        if (patient.getGender() == null) missing.add("gender");
        if (blank(patient.getPhoneNumber())) missing.add("phoneNumber");
        if (blank(account.getEmail())) missing.add("email");
        return new PatientSelfProfileResponse(patient.getId(), patient.getPatientNumber(), patient.getFullName(),
                patient.getDateOfBirth(), patient.getGender(), patient.getPhoneNumber(), patient.getAddress(),
                patient.getCreatedAt(), patient.getUpdatedAt(), account.getEmail(), false,
                (5 - missing.size()) * 20, List.copyOf(missing));
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }

    public PatientResponse toResponse(Patient patient) {
        return new PatientResponse(patient.getId(), patient.getPatientNumber(), patient.getFullName(),
                patient.getDateOfBirth(), patient.getGender(), patient.getPhoneNumber(), patient.getAddress(),
                patient.getCreatedAt(), patient.getUpdatedAt());
    }

    public PatientPageResponse toPageResponse(Page<Patient> page) {
        return new PatientPageResponse(page.getContent().stream().map(this::toResponse).toList(),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(),
                page.isFirst(), page.isLast());
    }
}
