package com.smartlims.patients.service;

import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.service.AuthRequestException;
import com.smartlims.patients.dto.*;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.repository.PatientRepository;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class PatientService {
    private static final ZoneId LAB_ZONE = ZoneId.of("Asia/Jerusalem");
    private static final Set<String> SORT_FIELDS = Set.of(
            "patientNumber", "fullName", "dateOfBirth", "createdAt", "updatedAt");
    private final PatientRepository patients;
    private final UserAccountRepository users;

    public PatientService(PatientRepository patients, UserAccountRepository users) {
        this.patients = patients;
        this.users = users;
    }

    @Transactional
    public PatientResponse create(Authentication actor, @Valid CreatePatientRequest request) {
        requireRole(actor, "ADMIN", "RECEPTIONIST");
        validateBirthDate(request.dateOfBirth());
        String number = String.format(Locale.ROOT, "PAT-%06d", patients.nextPatientNumber());
        Patient patient = Patient.create(number, users.getReferenceById(actorId(actor)), request.fullName(),
                request.dateOfBirth(), request.gender(), request.phoneNumber(), request.address());
        return PatientResponse.from(patients.saveAndFlush(patient));
    }

    @Transactional(readOnly = true)
    public PatientPageResponse list(Authentication actor, MultiValueMap<String, String> query) {
        requireRole(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN");
        int page = integer(single(query, "page", "0"), "page", 0, Integer.MAX_VALUE);
        int size = integer(single(query, "size", "20"), "size", 1, 100);
        String search = single(query, "search", "").strip();
        if (search.length() > 120) throw invalid("search");
        String[] sort = single(query, "sort", "createdAt,desc").split(",", -1);
        if (sort.length != 2 || !SORT_FIELDS.contains(sort[0])
                || !(sort[1].equals("asc") || sort[1].equals("desc"))) throw invalid("sort");
        Sort ordering = Sort.by(Sort.Direction.fromString(sort[1]), sort[0]).and(Sort.by("id"));
        Specification<Patient> filter = (root, ignored, builder) -> {
            if (search.isEmpty()) return builder.conjunction();
            String pattern = "%" + escape(search) + "%";
            String insensitive = pattern.toLowerCase(Locale.ROOT);
            return builder.or(
                    builder.like(builder.lower(root.get("fullName")), insensitive, '\\'),
                    builder.like(builder.lower(root.get("patientNumber")), insensitive, '\\'),
                    builder.like(root.get("phoneNumber"), pattern, '\\'));
        };
        PageRequest pageable = PageRequest.of(page, size, ordering);
        // JPA uses an integer offset; very distant empty pages can be answered from the count.
        if (pageable.getOffset() > Integer.MAX_VALUE) {
            long total = patients.count(filter);
            if (pageable.getOffset() >= total) {
                return PatientPageResponse.from(new PageImpl<>(List.of(), pageable, total));
            }
        }
        return PatientPageResponse.from(patients.findAll(filter, pageable).map(PatientResponse::from));
    }

    @Transactional(readOnly = true)
    public PatientResponse get(Authentication actor, String id) {
        requireRole(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN", "PATIENT");
        UUID patientId = profileId(id);
        Patient patient = hasRole(actor, "PATIENT")
                ? patients.findByIdAndUser_Id(patientId, actorId(actor)).orElseThrow(this::missing)
                : patients.findById(patientId).orElseThrow(this::missing);
        return PatientResponse.from(patient);
    }

    @Transactional
    public PatientResponse update(Authentication actor, String id, @Valid UpdatePatientRequest request) {
        requireRole(actor, "ADMIN", "RECEPTIONIST");
        UUID patientId = profileId(id);
        validateBirthDate(request.dateOfBirth());
        Patient patient = patients.findById(patientId).orElseThrow(this::missing);
        patient.replaceProfile(request.fullName(), request.dateOfBirth(), request.gender(),
                request.phoneNumber(), request.address());
        patients.flush();
        return PatientResponse.from(patient);
    }

    private void validateBirthDate(LocalDate date) {
        if (date.isAfter(LocalDate.now(LAB_ZONE))) throw invalid("dateOfBirth");
    }

    private UUID profileId(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) throw invalid("id");
            return id;
        } catch (IllegalArgumentException error) { throw invalid("id"); }
    }

    private String single(MultiValueMap<String, String> query, String field, String fallback) {
        List<String> values = query.get(field);
        if (values == null) return fallback;
        if (values.size() != 1 || values.getFirst() == null) throw invalid(field);
        return values.getFirst();
    }

    private int integer(String value, String field, int min, int max) {
        try {
            if (!value.matches("[0-9]+")) throw invalid(field);
            int number = Integer.parseInt(value);
            if (number < min || number > max) throw invalid(field);
            return number;
        } catch (NumberFormatException error) { throw invalid(field); }
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private boolean hasRole(Authentication actor, String role) {
        return actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
    }

    private void requireRole(Authentication actor, String... roles) {
        if (actor == null || !actor.isAuthenticated()) {
            throw new AuthRequestException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication is required.", null);
        }
        for (String role : roles) if (hasRole(actor, role)) return;
        throw new AuthRequestException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access is denied.", null);
    }

    private UUID actorId(Authentication actor) { return UUID.fromString(actor.getName()); }

    private AuthRequestException missing() {
        return new AuthRequestException(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", "Patient not found.", null);
    }

    private AuthRequestException invalid(String field) {
        return new AuthRequestException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "Please correct the request fields.", field);
    }
}
