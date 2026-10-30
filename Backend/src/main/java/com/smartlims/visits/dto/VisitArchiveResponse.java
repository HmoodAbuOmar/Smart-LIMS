package com.smartlims.visits.dto;

import com.smartlims.results.dto.ResultResponse;
import com.smartlims.results.entity.ResultValue;
import com.smartlims.visits.entity.Visit;
import java.time.*;
import java.util.*;

public record VisitArchiveResponse(UUID id, String visitNumber, UUID orderId, String orderNumber,
        UUID appointmentId, Visit.Status status, Instant arrivedAt, LocalDate visitDate,
        Instant completedAt, List<Test> tests, List<ResultValue.Flag> resultFlags, String visitUrl) {
    public record Test(UUID orderItemId, UUID labTestId, String testCode, String testName,
            UUID resultId, Instant measuredAt, Instant publishedAt, List<ResultValue.Flag> flags,
            String resultUrl, String reportUrl) {}
    public record Detail(VisitArchiveResponse visit, List<ResultResponse> results) {}
    public record TestOption(UUID labTestId, String testCode, String testName) {}
}
