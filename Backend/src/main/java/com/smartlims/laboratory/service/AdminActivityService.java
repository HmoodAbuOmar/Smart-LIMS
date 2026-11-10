package com.smartlims.laboratory.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.dto.AdminActivityResponses.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.repository.AdminActivityQueries;
import java.time.*;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AdminActivityService {
    private final LaboratoryAccess access;
    private final AdminActivityQueries queries;

    public AdminActivityService(LaboratoryAccess access, AdminActivityQueries queries) {
        this.access = access; this.queries = queries;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AuditPage audit(Authentication actor, LaboratoryQuery query) {
        access.current(actor, Role.ADMIN);
        var dates = HistoryDates.archive(query);
        var actorId = query.optionalId("actorId");
        var action = query.get("action", null);
        if (action != null && !java.util.Set.of("REGISTER", "RECEIVE", "ATTEST", "REJECT", "CREATE", "EDIT",
                "APPROVAL_INVALIDATED", "APPROVE", "PUBLISH", "CORRECTION", "ARRIVAL", "COMPLETE",
                "CHECK_IN", "VISIT_COMPLETE", "NO_SHOW").contains(action)
                && java.util.Arrays.stream(AuditOperation.values()).noneMatch(o -> o.action.equals(action))
                && !queries.actions().contains(action))
            throw LaboratoryException.invalid("action");
        return queries.audit(query, dates, actorId, action, HistoryDates.search(query));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Report report(Authentication actor, LaboratoryQuery query) {
        access.current(actor, Role.ADMIN);
        var now = Instant.now();
        var today = now.atZone(HistoryDates.ZONE).toLocalDate();
        var dates = query.values().containsKey("fromDate") || query.values().containsKey("toDate")
                ? HistoryDates.archive(query) : new HistoryDates(today.minusDays(29), today);
        return new Report(dates, HistoryDates.ZONE.getId(), now, queries.orders(dates), queries.tests(dates),
                queries.attendance(dates), queries.rejected(dates), FinancialSummary.unsupported(), List.of(
                new SourceDetail("ordersByStatus", "test_orders", "created_at", "One order; current stored status; PENDING displays as New."),
                new SourceDetail("testsByStatus", "order_items, test_results, visit_items, test_orders", "test_orders.created_at", "One ordered item: cancelled parent, else current publication completed, else visit/result work in progress, else pending. Correction versions do not multiply items."),
                new SourceDetail("appointments", "appointments, appointment_slots", "current slot starts_at", "Scheduled excludes cancellations; attended=CHECKED_IN or COMPLETED; noShow=NO_SHOW; awaitingAttendance=CONFIRMED. No time inference."),
                new SourceDetail("rejectedSamples", "samples", "rejected_at", "One rejected specimen, including retained originals after replacement."),
                new SourceDetail("financial", "No transaction source implemented", "Unavailable", "Unsupported amounts are null; order value does not establish receipts, refunds or pending payments.")));
    }
}
