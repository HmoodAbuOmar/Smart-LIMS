package com.smartlims.laboratory.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AdminDashboardResponse(String timezone, Instant generatedAt, Summary summary,
                                     Charts charts, Alerts alerts, FinancialSummary financial,
                                     List<AdminActivityResponses.SourceDetail> sourceDetails) {
    public record Summary(long uniquePatients, long orders, long scheduledAppointments,
                          long completedTests, long pendingResults) {}
    public record DailyOrders(LocalDate date, long count) {}
    public record TestDistribution(UUID labTestId, String testCode, String testName,
                                   long count, BigDecimal share) {}
    public record Charts(HistoryDates period, int days, long totalOrders, List<DailyOrders> dailyOrders,
                         long totalTests, List<TestDistribution> testDistribution) {}
    public record Alert(boolean supported, Long count, String sourceDetails) {}
    public record Alerts(Alert rejectedSamples, Alert resultsAwaitingReview, Alert ordersRequiringAttention) {}
}
