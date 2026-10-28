package com.smartlims.labtests.service;

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
import java.util.List;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class LabTestService {
    private final LabTestRepository tests;
    private final LabTestMapper mapper;

    public LabTestService(LabTestRepository tests, LabTestMapper mapper) {
        this.tests = tests;
        this.mapper = mapper;
    }

    @Transactional
    public LabTestResponse create(Authentication actor, @NotNull @Valid LabTestRequest request) {
        requireRole(actor, "ADMIN");
        if (tests.existsByCode(request.code())) throw LabTestException.duplicate();
        LabTest test = new LabTest(request.code(), request.name(), request.description(),
                request.price().setScale(2, RoundingMode.UNNECESSARY), request.sampleType(), request.preparationInstructions());
        request.categories().stream().map(LabTestCategory::valueOf).forEach(test.getCategories()::add);
        return mapper.toResponse(save(test));
    }

    @Transactional(readOnly = true)
    public LabTestPageResponse list(Authentication actor, @NotNull LabTestQueryRequest query) {
        requireRole(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN", "PATIENT");
        Boolean active = query.active();
        if (actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_PATIENT"))) {
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
    public LabTestResponse get(Authentication actor, String id) {
        requireRole(actor, "ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN", "PATIENT");
        return mapper.toResponse(tests.findById(identifier(id)).orElseThrow(LabTestException::missing));
    }

    @Transactional
    public LabTestResponse update(Authentication actor, String id, @NotNull @Valid LabTestRequest request) {
        requireRole(actor, "ADMIN");
        UUID testId = identifier(id);
        LabTest test = tests.findForUpdate(testId).orElseThrow(LabTestException::missing);
        if (tests.existsByCodeAndIdNot(request.code(), testId)) throw LabTestException.duplicate();
        test.setCode(request.code());
        test.setName(request.name());
        test.setDescription(request.description());
        test.setPrice(request.price().setScale(2, RoundingMode.UNNECESSARY));
        test.setSampleType(request.sampleType());
        test.setPreparationInstructions(request.preparationInstructions());
        test.getCategories().clear();
        request.categories().stream().map(LabTestCategory::valueOf).forEach(test.getCategories()::add);
        test.setUpdatedAt(Instant.now());
        return mapper.toResponse(save(test));
    }

    @Transactional
    public LabTestResponse changeStatus(Authentication actor, String id, @NotNull @Valid LabTestStatusRequest request) {
        requireRole(actor, "ADMIN");
        LabTest test = tests.findForUpdate(identifier(id)).orElseThrow(LabTestException::missing);
        test.setActive(request.active());
        test.setUpdatedAt(Instant.now());
        return mapper.toResponse(save(test));
    }

    private LabTest save(LabTest test) {
        try { return tests.saveAndFlush(test); }
        catch (DataIntegrityViolationException error) {
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
            if (!id.toString().equalsIgnoreCase(value)) throw LabTestException.invalid("id");
            return id;
        } catch (IllegalArgumentException | NullPointerException error) { throw LabTestException.invalid("id"); }
    }

    private void requireRole(Authentication actor, String... roles) {
        if (actor == null || !actor.isAuthenticated())
            throw new LabTestException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required.", null);
        for (String role : roles) {
            if (actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role))) return;
        }
        throw new LabTestException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied.", null);
    }
}
