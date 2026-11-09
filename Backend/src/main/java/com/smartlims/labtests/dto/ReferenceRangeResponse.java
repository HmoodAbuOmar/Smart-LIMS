package com.smartlims.labtests.dto;

import com.smartlims.labtests.entity.ReferenceRange;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ReferenceRangeResponse(UUID id, UUID labTestId, UUID parameterId,
                                     ReferenceRange.Applicability applicability,
                                     Integer minAgeDays, Integer maxAgeDays,
                                     BigDecimal lowerLimit, BigDecimal upperLimit,
                                     LocalDate validFrom, LocalDate validTo, Instant createdAt,
                                     Status status, LocalDate classificationDate) {
    public enum Status {CURRENT, FUTURE, EXPIRED}

    public static ReferenceRangeResponse from(ReferenceRange range, LocalDate today) {
        Status status = range.getValidTo() != null && !range.getValidTo().isAfter(today)
                ? Status.EXPIRED : range.getValidFrom() != null && range.getValidFrom().isAfter(today)
                ? Status.FUTURE : Status.CURRENT;
        return new ReferenceRangeResponse(range.getId(), range.getParameter().getLabTest().getId(),
                range.getParameter().getId(), range.getApplicability(), range.getMinAgeDays(),
                range.getMaxAgeDays(), range.getLowerLimit(), range.getUpperLimit(), range.getValidFrom(),
                range.getValidTo(), range.getCreatedAt(), status, today);
    }
}
