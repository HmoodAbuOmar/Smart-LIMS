package com.smartlims.labtests.service;

import com.smartlims.laboratory.service.AuditPublisher;
import static com.smartlims.laboratory.dto.AuditOperation.*;

import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.LoginEligibility;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.entity.LabTestCategory;
import com.smartlims.labtests.exception.LabTestException;
import com.smartlims.labtests.mapper.LabTestMapper;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.labtests.specification.LabTestSpecifications;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.math.RoundingMode;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class LabTestService {
    private final AuditPublisher audit;
    private final LabTestRepository tests;
    private final LabTestMapper mapper;
    private final UserAccountRepository users;

    public LabTestService(LabTestRepository tests, LabTestMapper mapper, UserAccountRepository users, AuditPublisher audit) {
        this.audit = audit;
        this.tests = tests;
        this.mapper = mapper;
        this.users = users;
    }

    @Transactional
    public LabTestResponse create(Authentication actor, @NotNull @Valid LabTestRequest request) {
        var account = currentAccount(actor, "ADMIN");
        if (tests.existsByCode(request.code()))
            throw LabTestException.duplicate();
        LabTest test = new LabTest(request.code(), request.name(), request.description(),
                request.price().setScale(2, RoundingMode.UNNECESSARY), request.sampleType(), request.preparationInstructions());
        request.categories().stream().map(LabTestCategory::valueOf).forEach(test.getCategories()::add);
        var saved = save(test);
        audit.record(account, CATALOG_CREATE, saved.getId());
        return mapper.toResponse(saved);
    }

    @Transactional(readOnly = true)
    public LabTestPageResponse list(Authentication actor, @NotNull LabTestQueryRequest query) {
        UserAccount account = currentAccount(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN", "PATIENT");
        Boolean active = query.active();
        if (account.getRole() == Role.PATIENT) {
            if (Boolean.FALSE.equals(active))
                throw new LabTestException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied.", null);
            active = true;
        }
        String[] sort = query.sort().split(",");
        PageRequest pageable = PageRequest.of(query.page(), query.size(),
                Sort.by(Sort.Direction.fromString(sort[1]), sort[0]).and(Sort.by("id")));
        var filter = LabTestSpecifications.filter(query.search(), active, query.category());
        if (pageable.getOffset() > Integer.MAX_VALUE) {
            long total = tests.count(filter);
            if (pageable.getOffset() >= total)
                return mapper.toPageResponse(new PageImpl<>(List.of(), pageable, total));
            throw LabTestException.invalid("page");
        }
        return mapper.toPageResponse(tests.findAll(filter, pageable));
    }

    @Transactional(readOnly = true)
    public List<String> sampleTypes(Authentication actor) {
        currentAccount(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN");
        return tests.findSampleTypes();
    }

    @Transactional(readOnly = true)
    public LabTestResponse get(Authentication actor, String id) {
        UserAccount account = currentAccount(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN", "PATIENT");
        LabTest test = tests.findById(identifier(id)).orElseThrow(LabTestException::missing);
        if (!test.isActive() && account.getRole() == Role.PATIENT)
            throw LabTestException.missing();
        return mapper.toResponse(test);
    }

    @Transactional
    public LabTestResponse update(Authentication actor, String id, @NotNull @Valid LabTestRequest request) {
        return updateFields(actor, id, request, true);
    }

    @Transactional
    public LabTestResponse updateDetails(Authentication actor, String id, @NotNull @Valid LabTestDetailsRequest request) {
        return updateFields(actor, id, request.asCatalogRequest(), false);
    }

    private LabTestResponse updateFields(Authentication actor, String id, LabTestRequest request, boolean replaceCategories) {
        var account = currentAccount(actor, "ADMIN");
        UUID testId = identifier(id);
        LabTest test = tests.findForUpdate(testId).orElseThrow(LabTestException::missing);
        if (tests.existsByCodeAndIdNot(request.code(), testId))
            throw LabTestException.duplicate();
        boolean changed = !java.util.Objects.equals(test.getCode(), request.code())
                || !java.util.Objects.equals(test.getName(), request.name())
                || !java.util.Objects.equals(test.getDescription(), request.description())
                || test.getPrice().compareTo(request.price()) != 0
                || !java.util.Objects.equals(test.getSampleType(), request.sampleType())
                || !java.util.Objects.equals(test.getPreparationInstructions(), request.preparationInstructions())
                || replaceCategories && !test.getCategories().equals(request.categories().stream()
                .map(LabTestCategory::valueOf).collect(java.util.stream.Collectors.toSet()));
        test.setCode(request.code());
        test.setName(request.name());
        test.setDescription(request.description());
        test.setPrice(request.price().setScale(2, RoundingMode.UNNECESSARY));
        test.setSampleType(request.sampleType());
        test.setPreparationInstructions(request.preparationInstructions());
        if (replaceCategories) {
            test.getCategories().clear();
            request.categories().stream().map(LabTestCategory::valueOf).forEach(test.getCategories()::add);
        }
        test.setUpdatedAt(Instant.now());
        var saved = save(test);
        if (changed) audit.record(account, CATALOG_UPDATE, saved.getId());
        return mapper.toResponse(saved);
    }

    @Transactional
    public LabTestResponse changeStatus(Authentication actor, String id, @NotNull @Valid LabTestStatusRequest request) {
        var account = currentAccount(actor, "ADMIN");
        LabTest test = tests.findForUpdate(identifier(id)).orElseThrow(LabTestException::missing);
        boolean changed = test.isActive() != request.active();
        test.setActive(request.active());
        test.setUpdatedAt(Instant.now());
        var saved = save(test);
        if (changed) audit.record(account, request.active() ? CATALOG_ACTIVATE : CATALOG_DEACTIVATE, saved.getId());
        return mapper.toResponse(saved);
    }

    private LabTest save(LabTest test) {
        try {
            return tests.saveAndFlush(test);
        } catch (DataIntegrityViolationException error) {
            // The unique constraint is authoritative even when concurrent requests pass the precheck.
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (cause instanceof ConstraintViolationException constraint
                        && "lab_tests_code_key".equals(constraint.getConstraintName()))
                    throw LabTestException.duplicate();
            }
            throw error;
        }
    }

    private UUID identifier(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value))
                throw LabTestException.invalid("id");
            return id;
        } catch (IllegalArgumentException | NullPointerException error) {
            throw LabTestException.invalid("id");
        }
    }

    private UserAccount currentAccount(Authentication actor, String... roles) {
        if (actor == null || !actor.isAuthenticated() || actor instanceof AnonymousAuthenticationToken)
            throw new LabTestException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required.", null);
        if (Arrays.stream(roles).noneMatch(role -> actor.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_" + role))))
            throw new LabTestException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied.", null);
        UUID id;
        try {
            id = UUID.fromString(actor.getName());
        } catch (IllegalArgumentException | NullPointerException error) {
            throw new LabTestException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required.", null);
        }
        UserAccount account = users.findById(id).orElseThrow(() ->
                new LabTestException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required.", null));
        if (!LoginEligibility.eligible(account))
            throw new LabTestException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required.", null);
        for (String role : roles) {
            if (account.getRole() == Role.valueOf(role))
                return account;
        }
        throw new LabTestException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied.", null);
    }
}
