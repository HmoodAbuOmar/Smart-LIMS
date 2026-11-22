package com.smartlims.laboratory.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AdminActivityResponses {
    private AdminActivityResponses() {}

    public record Actor(UUID id, String name) {}
    public record AuditEvent(UUID id, Instant recordedAt, Instant occurredAt, Actor actor,
                             String action, String entityName, UUID entityId, String details) {}
    public record AuditPage(List<AuditEvent> content, int page, int size, long totalElements,
                            int totalPages, boolean first, boolean last, String timezone,
                            List<Actor> actors, List<String> actions, String coverage) {}
    public record StatusCount(String status, long count, BigDecimal share) {}
    public record Attendance(long scheduled, long attended, long noShow, long cancelled, long awaitingAttendance) {}
    public record SourceDetail(String metric, String source, String dateField, String rule) {}
    public record Report(HistoryDates period, String timezone, Instant generatedAt,
                         List<StatusCount> ordersByStatus, List<StatusCount> testsByStatus,
                         Attendance appointments, long rejectedSamples, FinancialSummary financial,
                         List<SourceDetail> sourceDetails) {}
}
