package com.smartlims.patients.service;

import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.patients.dto.*;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.exception.PatientAuthenticationException;
import com.smartlims.patients.exception.PatientForbiddenException;
import com.smartlims.patients.exception.PatientNotFoundException;
import com.smartlims.patients.exception.PatientValidationException;
import com.smartlims.patients.mapper.PatientMapper;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.patients.specification.PatientSpecifications;
import jakarta.validation.Valid;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class PatientService {
    private static final ZoneId LAB_ZONE = ZoneId.of("Asia/Jerusalem");
    private final PatientRepository patients;
    private final UserAccountRepository users;
    private final PatientMapper mapper;

    public PatientService(PatientRepository patients, UserAccountRepository users, PatientMapper mapper) {
        this.patients = patients;
        this.users = users;
        this.mapper = mapper;
    }

    @Transactional
    public PatientResponse create(Authentication actor, @Valid CreatePatientRequest request) {
        requireRole(actor, "ADMIN", "RECEPTIONIST");
        validateBirthDate(request.dateOfBirth());
        String number = String.format(Locale.ROOT, "PAT-%06d", patients.nextPatientNumber());
        Patient patient = new Patient(number, users.getReferenceById(actorId(actor)), request.fullName(),
                request.dateOfBirth(), request.gender(), request.phoneNumber(), request.address());
        return mapper.toResponse(patients.saveAndFlush(patient));
    }

    @Transactional(readOnly = true)
    public PatientPageResponse list(Authentication actor, @Valid PatientQueryRequest query) {
        requireRole(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN");
        String[] sort = query.sort().split(",");
        Sort ordering = Sort.by(Sort.Direction.fromString(sort[1]), sort[0]).and(Sort.by("id"));
        Specification<Patient> filter = PatientSpecifications.search(query.search());
        PageRequest pageable = PageRequest.of(query.page(), query.size(), ordering);
        // JPA uses an integer offset; very distant empty pages can be answered from the count.
        if (pageable.getOffset() > Integer.MAX_VALUE) {
            long total = patients.count(filter);
            if (pageable.getOffset() >= total) {
                return mapper.toPageResponse(new PageImpl<>(List.of(), pageable, total));
            }
        }
        return mapper.toPageResponse(patients.findAll(filter, pageable));
    }

    @Transactional(readOnly = true)
    public PatientResponse get(Authentication actor, String id) {
        requireRole(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN", "PATIENT");
        UUID patientId = profileId(id);
        Patient patient = hasRole(actor, "PATIENT")
                ? patients.findByIdAndUser_Id(patientId, actorId(actor)).orElseThrow(PatientNotFoundException::new)
                : patients.findById(patientId).orElseThrow(PatientNotFoundException::new);
        return mapper.toResponse(patient);
    }

    @Transactional
    public PatientResponse update(Authentication actor, String id, @Valid UpdatePatientRequest request) {
        requireRole(actor, "ADMIN", "RECEPTIONIST");
        UUID patientId = profileId(id);
        validateBirthDate(request.dateOfBirth());
        Patient patient = patients.findById(patientId).orElseThrow(PatientNotFoundException::new);
        patient.setFullName(request.fullName());
        patient.setDateOfBirth(request.dateOfBirth());
        patient.setGender(request.gender());
        patient.setPhoneNumber(request.phoneNumber());
        patient.setAddress(request.address());
        patient.setUpdatedAt(Instant.now());
        patients.flush();
        return mapper.toResponse(patient);
    }

    private void validateBirthDate(LocalDate date) {
        if (date.isAfter(LocalDate.now(LAB_ZONE))) throw new PatientValidationException("dateOfBirth");
    }

    private UUID profileId(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) throw new PatientValidationException("id");
            return id;
        } catch (IllegalArgumentException error) { throw new PatientValidationException("id"); }
    }

    private boolean hasRole(Authentication actor, String role) {
        return actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
    }

    private void requireRole(Authentication actor, String... roles) {
        if (actor == null || !actor.isAuthenticated()) {
            throw new PatientAuthenticationException();
        }
        for (String role : roles) if (hasRole(actor, role)) return;
        throw new PatientForbiddenException();
    }

    private UUID actorId(Authentication actor) { return UUID.fromString(actor.getName()); }
}
