package com.smartlims.labtests.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.entity.ReferenceRange;
import com.smartlims.labtests.entity.TestParameter;
import com.smartlims.labtests.repository.*;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class ReferenceRangeService {
    private final LaboratoryAccess access;
    private final LabTestRepository tests;
    private final TestParameterRepository parameters;
    private final ReferenceRangeRepository ranges;

    public ReferenceRangeService(LaboratoryAccess access, LabTestRepository tests,
                                 TestParameterRepository parameters, ReferenceRangeRepository ranges) {
        this.access = access;
        this.tests = tests;
        this.parameters = parameters;
        this.ranges = ranges;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ReferenceRangeResponse create(Authentication actor, String testId, String parameterId,
                                         @NotNull @Valid ReferenceRangeRequest body) {
        access.current(actor, Role.ADMIN);
        var testKey = LaboratoryInput.uuid(testId, "testId");
        var parameterKey = LaboratoryInput.uuid(parameterId, "parameterId");
        body.validateBounds();
        var today = LocalDate.now(HistoryDates.ZONE);
        // Same lock as parameter edits; acquired even when the range set is empty.
        tests.findForUpdate(testKey).orElseThrow(() -> LaboratoryException.missing("LAB_TEST"));
        var parameter = numericParameter(testKey, parameterKey);
        var applicability = ReferenceRange.Applicability.valueOf(body.applicability());
        Specification<ReferenceRange> overlap = (r, q, c) -> {
            var predicate = c.and(c.equal(r.get("parameter").get("id"), parameterKey),
                    c.equal(r.get("applicability"), applicability));
            if (body.maxAgeDays() != null)
                predicate = c.and(predicate, c.or(c.isNull(r.get("minAgeDays")), c.lessThan(r.get("minAgeDays"), body.maxAgeDays())));
            if (body.minAgeDays() != null)
                predicate = c.and(predicate, c.or(c.isNull(r.get("maxAgeDays")), c.greaterThan(r.get("maxAgeDays"), body.minAgeDays())));
            if (body.toDate() != null)
                predicate = c.and(predicate, c.or(c.isNull(r.get("validFrom")), c.lessThan(r.get("validFrom"), body.toDate())));
            if (body.fromDate() != null)
                predicate = c.and(predicate, c.or(c.isNull(r.get("validTo")), c.greaterThan(r.get("validTo"), body.fromDate())));
            return predicate;
        };
        if (ranges.exists(overlap))
            throw LaboratoryException.conflict("REFERENCE_RANGE_OVERLAP");
        var range = new ReferenceRange(parameter, applicability, body.minAgeDays(), body.maxAgeDays(),
                body.lowerLimit(), body.upperLimit(), body.fromDate(), body.toDate());
        return ReferenceRangeResponse.from(ranges.saveAndFlush(range), today);
    }

    @Transactional(readOnly = true)
    public LaboratoryQuery.PageBody<ReferenceRangeResponse> list(Authentication actor, String testId,
                                                                String parameterId, LaboratoryQuery query) {
        access.current(actor, Role.ADMIN);
        var testKey = LaboratoryInput.uuid(testId, "testId");
        var parameterKey = LaboratoryInput.uuid(parameterId, "parameterId");
        boolean includeExpired = query.bool("includeExpired");
        if (!tests.existsById(testKey))
            throw LaboratoryException.missing("LAB_TEST");
        numericParameter(testKey, parameterKey);
        var today = LocalDate.now(HistoryDates.ZONE);
        Specification<ReferenceRange> visible = (r, q, c) -> c.and(
                c.equal(r.get("parameter").get("id"), parameterKey), includeExpired ? c.conjunction()
                        : c.or(c.isNull(r.get("validTo")), c.greaterThan(r.get("validTo"), today)));
        var page = query.find(ranges, visible, Sort.by("createdAt", "id"));
        return LaboratoryQuery.page(page, page.getContent().stream().map(r -> ReferenceRangeResponse.from(r, today)).toList());
    }

    private TestParameter numericParameter(UUID testId, UUID parameterId) {
        var parameter = parameters.findByIdAndLabTest_Id(parameterId, testId)
                .orElseThrow(() -> LaboratoryException.missing("PARAMETER"));
        if (parameter.getResultType() != TestParameter.ValueType.NUMERIC)
            throw LaboratoryException.conflict("REFERENCE_RANGE_NUMERIC_REQUIRED");
        return parameter;
    }
}
