package com.smartlims.patients.dto;

import com.smartlims.appointments.dto.AppointmentResponses;
import com.smartlims.labtests.dto.LabTestResponse;
import com.smartlims.orders.dto.OrderSummaryResponse;
import com.smartlims.results.dto.HealthTrendResponse;
import java.time.*;
import java.util.*;

public record PatientDashboardResponse(UUID patientId, String displayName, Instant asOf, String timeZone,
        long totalOrders, long upcomingAppointmentCount, long currentPublishedResultCount,
        Notifications notifications, List<RecentOrder> recentOrders, AppointmentResponses.Detail nextAppointment,
        List<PublishedResult> latestResults, List<LabTestResponse> catalogSuggestions, TrendPreview healthTrendPreview) {
    public record Notifications(boolean available, Long unreadCount) {}
    public record RecentOrder(OrderSummaryResponse order, List<HealthTrendResponse.VisitLink> visits) {}
    public record PublishedResult(UUID resultId, UUID orderItemId, UUID orderId, String orderNumber,
            UUID labTestId, String testCode, String testName, Instant publishedAt, LocalDate publicationDate,
            String resultUrl, String reportUrl) {}
    public record TrendPreview(HealthTrendResponse.Series series, HealthTrendResponse.Measurement latest,
            List<HealthTrendResponse.Measurement> chartData) {}
}
