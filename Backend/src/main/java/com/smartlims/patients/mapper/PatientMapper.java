package com.smartlims.patients.mapper;

import com.smartlims.patients.dto.PatientPageResponse;
import com.smartlims.patients.dto.PatientResponse;
import com.smartlims.patients.entity.Patient;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Component;

@Component
public class PatientMapper {
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
