package com.smartlims.laboratory.repository;

import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.dto.AdminActivityResponses.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AdminActivityQueries {
    private final JdbcTemplate jdbc;

    public AdminActivityQueries(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // Both displayed and searched details come from this fixed allowlist, never event.reason.
    private static final String DETAILS = """
            CASE e.kind
             WHEN 'REGISTER' THEN 'Registered a sample.' WHEN 'RECEIVE' THEN 'Received a sample.'
             WHEN 'ATTEST' THEN 'Recorded sample suitability.' WHEN 'REJECT' THEN 'Rejected a sample.'
             WHEN 'CREATE' THEN 'Created a result draft.' WHEN 'EDIT' THEN 'Updated a result draft.'
             WHEN 'APPROVAL_INVALIDATED' THEN 'Invalidated result approval.'
             WHEN 'APPROVE' THEN 'Approved a result.' WHEN 'PUBLISH' THEN 'Published a result.'
             WHEN 'CORRECTION' THEN 'Created a result correction.' WHEN 'ARRIVAL' THEN 'Recorded patient arrival.'
             WHEN 'COMPLETE' THEN 'Completed a visit.' WHEN 'CHECK_IN' THEN 'Checked in an appointment.'
             WHEN 'VISIT_COMPLETE' THEN 'Completed an appointment visit.' WHEN 'NO_SHOW' THEN 'Marked an appointment no-show.'
             ELSE 'Recorded a laboratory workflow event.' END
            """;
    private static final String ENTITY = "CASE WHEN e.result_id IS NOT NULL THEN 'result' WHEN e.sample_id IS NOT NULL THEN 'sample' WHEN e.visit_id IS NOT NULL THEN 'visit' ELSE 'appointment' END";
    private static final String ENTITY_ID = "coalesce(e.result_id,e.sample_id,e.visit_id,e.appointment_id)";

    public List<String> actions() {
        return jdbc.queryForList("SELECT DISTINCT kind FROM laboratory_events ORDER BY kind", String.class);
    }

    public List<Actor> actors() {
        return jdbc.query("SELECT DISTINCT ON (actor_id) actor_id,actor_name_snapshot FROM laboratory_events ORDER BY actor_id,recorded_at DESC,id DESC",
                (r, n) -> new Actor(r.getObject(1, UUID.class), r.getString(2)));
    }

    public AuditPage audit(LaboratoryQuery query, HistoryDates dates, UUID actor, String action, String search) {
        var args = new ArrayList<Object>();
        String filter = dateFilter("e.recorded_at", dates, args);
        if (actor != null) { filter += " AND e.actor_id=?"; args.add(actor); }
        if (action != null) { filter += " AND e.kind=?"; args.add(action); }
        if (!search.isEmpty()) {
            filter += " AND (strpos(lower(" + ENTITY + "),?)>0 OR strpos(lower(" + ENTITY_ID + "::text),?)>0 OR strpos(lower(" + DETAILS + "),?)>0)";
            args.addAll(Collections.nCopies(3, search.toLowerCase(Locale.ROOT)));
        }
        long total = jdbc.queryForObject("SELECT count(*) FROM laboratory_events e WHERE " + filter, Long.class, args.toArray());
        List<AuditEvent> content = List.of();
        if ((long) query.page() * query.size() < total) {
            args.add(query.size()); args.add((long) query.page() * query.size());
            content = jdbc.query("SELECT e.id,e.recorded_at,e.occurred_at,e.actor_id,e.actor_name_snapshot,e.kind," + ENTITY + " AS entity_name," + ENTITY_ID + " AS entity_id," + DETAILS + " AS details FROM laboratory_events e WHERE " + filter + " ORDER BY e.recorded_at DESC,e.id DESC LIMIT ? OFFSET ?",
                    (r, n) -> new AuditEvent(r.getObject("id", UUID.class), r.getTimestamp("recorded_at").toInstant(), r.getTimestamp("occurred_at").toInstant(), new Actor(r.getObject("actor_id", UUID.class), r.getString("actor_name_snapshot")), r.getString("kind"), r.getString("entity_name"), r.getObject("entity_id", UUID.class), r.getString("details")), args.toArray());
        }
        int pages = (int) Math.min(Integer.MAX_VALUE, (total + query.size() - 1) / query.size());
        return new AuditPage(content, query.page(), query.size(), total, pages, query.page() == 0,
                (long) query.page() + 1 >= pages, HistoryDates.ZONE.getId(), actors(), actions(),
                "Retained laboratory workflow events only; configuration and general account/order actions are not recorded.");
    }

    public List<StatusCount> orders(HistoryDates dates) {
        var args = new ArrayList<Object>();
        return counts("SELECT o.status,count(*) AS total FROM test_orders o WHERE " + dateFilter("o.created_at", dates, args) + " GROUP BY o.status", args);
    }

    public List<StatusCount> tests(HistoryDates dates) {
        var args = new ArrayList<Object>();
        return counts("""
                SELECT CASE WHEN o.status='CANCELLED' THEN 'CANCELLED'
                  WHEN EXISTS(SELECT 1 FROM test_results r WHERE r.order_item_id=i.id AND r.is_current) THEN 'COMPLETED'
                  WHEN EXISTS(SELECT 1 FROM visit_items v WHERE v.order_item_id=i.id)
                    OR EXISTS(SELECT 1 FROM test_results r WHERE r.order_item_id=i.id) THEN 'IN_PROGRESS'
                  ELSE 'PENDING' END AS status,count(*) AS total
                FROM order_items i JOIN test_orders o ON o.id=i.order_id WHERE
                """ + dateFilter("o.created_at", dates, args) + " GROUP BY 1", args);
    }

    public Attendance attendance(HistoryDates dates) {
        var args = new ArrayList<Object>();
        return jdbc.queryForObject("""
                SELECT count(*) FILTER(WHERE a.status<>'CANCELLED') AS scheduled,
                 count(*) FILTER(WHERE a.status IN ('CHECKED_IN','COMPLETED')) AS attended,
                 count(*) FILTER(WHERE a.status='NO_SHOW') AS no_show,
                 count(*) FILTER(WHERE a.status='CANCELLED') AS cancelled,
                 count(*) FILTER(WHERE a.status='CONFIRMED') AS awaiting
                FROM appointments a JOIN appointment_slots s ON s.id=a.slot_id WHERE
                """ + dateFilter("s.starts_at", dates, args), (r, n) -> new Attendance(r.getLong("scheduled"), r.getLong("attended"), r.getLong("no_show"), r.getLong("cancelled"), r.getLong("awaiting")), args.toArray());
    }

    public long rejected(HistoryDates dates) {
        var args = new ArrayList<Object>();
        return jdbc.queryForObject("SELECT count(*) FROM samples s WHERE s.status='REJECTED' AND " + dateFilter("s.rejected_at", dates, args), Long.class, args.toArray());
    }

    private List<StatusCount> counts(String sql, List<Object> args) {
        var totals = new HashMap<String, Long>();
        jdbc.query(sql, r -> { totals.put(r.getString("status"), r.getLong("total")); }, args.toArray());
        long total = totals.values().stream().mapToLong(Long::longValue).sum();
        return List.of("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED").stream().map(s -> {
            long count = totals.getOrDefault(s, 0L);
            return new StatusCount(s, count, total == 0 ? BigDecimal.ZERO.setScale(1) : BigDecimal.valueOf(count).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(total), 1, RoundingMode.HALF_UP));
        }).toList();
    }

    private String dateFilter(String column, HistoryDates dates, List<Object> args) {
        String filter = "true";
        if (dates.start() != null) { filter += " AND " + column + ">=?"; args.add(Timestamp.from(dates.start())); }
        if (dates.end() != null) { filter += " AND " + column + "<?"; args.add(Timestamp.from(dates.end())); }
        return filter;
    }
}
