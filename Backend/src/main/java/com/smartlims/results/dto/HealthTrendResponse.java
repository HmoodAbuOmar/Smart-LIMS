package com.smartlims.results.dto;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.results.entity.ResultValue;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public record HealthTrendResponse(Series series, String timeZone, LocalDate fromDate, LocalDate toDate,
        int measurementCount, Measurement latest, Measurement previous, BigDecimal absoluteChange,
        BigDecimal percentageChange, List<Measurement> chartData, LaboratoryQuery.PageBody<Measurement> measurements) {
    public record SpecimenKind(String sampleType, String containerType) {}
    public record Series(String seriesId, UUID parameterId, String code, String name, String unit,
            String method, List<SpecimenKind> specimenKinds, int measurementCount, Instant latestMeasuredAt) {}
    public record VisitLink(UUID id, String visitNumber, String visitUrl) {}
    public record Measurement(UUID valueId, UUID resultId, UUID orderItemId, UUID orderId,
            String orderNumber, String testCode, String testName, UUID parameterId, String code,
            String name, Instant measuredAt, LocalDate measurementDate, Instant publishedAt,
            BigDecimal numericValue, String numericComparator, BigDecimal chartValue, String unit,
            String method, String referenceText, BigDecimal referenceMin, BigDecimal referenceMax,
            ResultValue.Flag flag, String notes, String explanation, List<VisitLink> visits, String resultUrl) {}
}
