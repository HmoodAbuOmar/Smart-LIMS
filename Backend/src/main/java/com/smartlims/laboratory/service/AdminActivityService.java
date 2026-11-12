package com.smartlims.laboratory.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.dto.AdminActivityResponses.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.repository.AdminActivityQueries;
import com.smartlims.laboratory.repository.AdminDashboardQueries;
import com.smartlims.laboratory.dto.AdminDashboardResponse.*;
import java.time.*;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AdminActivityService {
    private final LaboratoryAccess access;
    private final AdminActivityQueries queries;
    private final AdminDashboardQueries dashboard;

    public AdminActivityService(LaboratoryAccess access, AdminActivityQueries queries, AdminDashboardQueries dashboard) {
        this.access = access; this.queries = queries; this.dashboard = dashboard;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AdminDashboardResponse dashboard(Authentication actor, LaboratoryQuery query) {
        access.current(actor, Role.ADMIN);
        String selection = query.get("days", "7");
        if (!selection.equals("7") && !selection.equals("14")) throw LaboratoryException.invalid("days");
        int days = Integer.parseInt(selection);
        var now = Instant.now();
        var today = now.atZone(HistoryDates.ZONE).toLocalDate();
        var period = new HistoryDates(today.minusDays(days - 1L), today);
        var all = new HistoryDates(null, null);
        var tests = queries.tests(all);
        long completed = tests.stream().filter(s -> s.status().equals("COMPLETED")).mapToLong(StatusCount::count).sum();
        long pending = tests.stream().filter(s -> s.status().equals("PENDING") || s.status().equals("IN_PROGRESS")).mapToLong(StatusCount::count).sum();
        var daily = dashboard.dailyOrders(period);
        var distribution = dashboard.distribution(period);
        return new AdminDashboardResponse(HistoryDates.ZONE.getId(), now,
                new Summary(dashboard.patients(), queries.orders(all).stream().mapToLong(StatusCount::count).sum(),
                        queries.attendance(all).scheduled(), completed, pending),
                new Charts(period, days, daily.stream().mapToLong(DailyOrders::count).sum(), daily,
                        distribution.stream().mapToLong(TestDistribution::count).sum(), distribution),
                new Alerts(new Alert(true, queries.rejected(all), "Retained rejected specimens, including originals after replacement. Follow-up resolution is not tracked; this is not an unresolved-recollection count."),
                        new Alert(true, dashboard.awaitingReview(), "DRAFT result versions on noncancelled orders, including correction drafts. Excludes APPROVED/PUBLISHED; draft completeness is not implied."),
                        new Alert(false, null, "No explicit order attention flag or lifecycle rule is implemented. Result-value flags are not order flags.")),
                FinancialSummary.unsupported(), List.of(
                        new SourceDetail("summary", "patients; existing operational report order/test/attendance rules", "All retained records; current slot for appointments", "All-time current state, independent of charts. Unique patient profiles, all orders, noncancelled appointments, published items completed, noncancelled unpublished items pending. No historical sparkline."),
                        new SourceDetail("charts", "test_orders, order_items", "test_orders.created_at", "Last 7/14 Jerusalem calendar days including today. All order statuses; zero-filled daily order counts. Distribution counts historical item rows grouped by test ID/code/name snapshots, never quantities/result versions/current catalog.")));
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
