package com.smartlims.patients.service;

import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.security.LoginEligibility;
import com.smartlims.auth.service.VerificationTokens;
import com.smartlims.patients.dto.*;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.entity.PatientLinkToken;
import com.smartlims.patients.exception.PatientProfileException;
import com.smartlims.patients.exception.PatientAuthenticationException;
import com.smartlims.patients.exception.PatientForbiddenException;
import com.smartlims.patients.exception.PatientNotFoundException;
import com.smartlims.patients.exception.PatientValidationException;
import com.smartlims.patients.mapper.PatientMapper;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.patients.repository.PatientLinkTokenRepository;
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
import org.springframework.transaction.annotation.Isolation;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class PatientService {
    private static final ZoneId LAB_ZONE = ZoneId.of("Asia/Jerusalem");
    private final PatientRepository patients;
    private final UserAccountRepository users;
    private final PatientMapper mapper;
    private final PatientLinkTokenRepository linkTokens;
    private final VerificationTokens tokenValues;

    public PatientService(PatientRepository patients, UserAccountRepository users, PatientMapper mapper,
                          PatientLinkTokenRepository linkTokens, VerificationTokens tokenValues) {
        this.patients = patients;
        this.users = users;
        this.mapper = mapper;
        this.linkTokens = linkTokens;
        this.tokenValues = tokenValues;
    }

    @Transactional(readOnly = true)
    public PatientResponse getMe(Authentication actor) {
        UserAccount account = currentAccount(actor, false, "PATIENT");
        return mapper.toResponse(patients.findByUser_Id(account.getId())
                .orElseThrow(PatientProfileException::notLinked));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PatientSelfProfileResponse getMyProfile(Authentication actor) {
        UserAccount account = currentAccount(actor, false, "PATIENT");
        Patient patient = patients.findByUser_Id(account.getId()).orElseThrow(PatientProfileException::notLinked);
        return mapper.toSelfProfile(patient, account);
    }

    @Transactional
    public PatientSelfProfileResponse updateMyProfile(Authentication actor, @Valid UpdatePatientRequest request) {
        // Match creation/claim ordering; staff updates serialize on the same profile lock.
        UserAccount account = currentAccount(actor, true, "PATIENT");
        Patient patient = patients.findWithLockByUserId(account.getId()).orElseThrow(PatientProfileException::notLinked);
        validateBirthDate(request.dateOfBirth());
        patient.setFullName(request.fullName());
        patient.setDateOfBirth(request.dateOfBirth());
        patient.setGender(request.gender());
        patient.setPhoneNumber(request.phoneNumber());
        patient.setAddress(request.address());
        patient.setUpdatedAt(Instant.now());
        patients.flush();
        return mapper.toSelfProfile(patient, account);
    }

    @Transactional
    public PatientResponse createMe(Authentication actor, @Valid CreatePatientRequest request) {
        UserAccount account = currentAccount(actor, true, "PATIENT");
        if (patients.existsByUser_Id(account.getId()))
            throw PatientProfileException.conflict();
        validateBirthDate(request.dateOfBirth());
        String number = String.format(Locale.ROOT, "PAT-%06d", patients.nextPatientNumber());
        Patient patient = new Patient(number, account, request.fullName(), request.dateOfBirth(),
                request.gender(), request.phoneNumber(), request.address());
        patient.linkAccount(account);
        return mapper.toResponse(patients.saveAndFlush(patient));
    }

    @Transactional
    public PatientLinkTokenResponse issueLinkToken(Authentication actor, String id) {
        UserAccount issuer = currentAccount(actor, true, "ADMIN", "RECEPTIONIST");
        Patient patient = patients.findWithLockById(profileId(id)).orElseThrow(PatientNotFoundException::new);
        if (patient.getUser() != null)
            throw PatientProfileException.conflict();
        Instant now = Instant.now();
        linkTokens.revokeOutstanding(patient.getId(), now);
        String rawToken = tokenValues.create();
        PatientLinkToken token = linkTokens.saveAndFlush(new PatientLinkToken(
                tokenValues.hash(rawToken), patient, issuer, now.plusSeconds(600)));
        return new PatientLinkTokenResponse(rawToken, token.getExpiresAt());
    }

    @Transactional
    public PatientResponse linkMe(Authentication actor, @Valid LinkPatientRequest request) {
        UserAccount account = currentAccount(actor, true, "PATIENT");
        if (!request.token().matches("[A-Za-z0-9_-]{43}"))
            throw PatientProfileException.invalidToken();
        String hash = tokenValues.hash(request.token());
        UUID id = linkTokens.findPatientIdByTokenHash(hash).orElseThrow(PatientProfileException::invalidToken);
        // All claim/reissue paths lock the profile before token rows, preventing lock-order inversions.
        Patient patient = patients.findWithLockById(id).orElseThrow(PatientProfileException::invalidToken);
        PatientLinkToken token = linkTokens.findWithLockByTokenHash(hash).orElseThrow(PatientProfileException::invalidToken);
        Instant now = Instant.now();
        if (!token.usableAt(now))
            throw PatientProfileException.invalidToken();
        if (patient.getUser() != null || patients.existsByUser_Id(account.getId())) {
            throw PatientProfileException.conflict();
        }
        patient.linkAccount(account);
        patient.setUpdatedAt(now);
        token.consume(now);
        patients.flush();
        return mapper.toResponse(patient);
    }

    private UserAccount currentAccount(Authentication actor, boolean lock, String... roles) {
        requireRole(actor, roles);
        UserAccount account = (lock ? users.findWithLockById(actorId(actor)) : users.findById(actorId(actor)))
                .orElseThrow(PatientAuthenticationException::new);
        if (!LoginEligibility.eligible(account))
            throw new PatientAuthenticationException();
        for (String role : roles)
            if (account.getRole() == Role.valueOf(role))
                return account;
        throw new PatientForbiddenException();
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
        Patient patient = patients.findWithLockById(patientId).orElseThrow(PatientNotFoundException::new);
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
        if (date.isAfter(LocalDate.now(LAB_ZONE)))
            throw new PatientValidationException("dateOfBirth");
    }

    private UUID profileId(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value))
                throw new PatientValidationException("id");
            return id;
        } catch (IllegalArgumentException error) {
            throw new PatientValidationException("id");
        }
    }

    private boolean hasRole(Authentication actor, String role) {
        return actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role));
    }

    private void requireRole(Authentication actor, String... roles) {
        if (actor == null || !actor.isAuthenticated()) {
            throw new PatientAuthenticationException();
        }
        for (String role : roles)
            if (hasRole(actor, role))
                return;
        throw new PatientForbiddenException();
    }

    private UUID actorId(Authentication actor) {
        return UUID.fromString(actor.getName());
    }
}
