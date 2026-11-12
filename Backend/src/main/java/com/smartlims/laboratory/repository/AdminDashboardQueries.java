package com.smartlims.laboratory.repository;

import com.smartlims.laboratory.dto.AdminDashboardResponse.*;
import com.smartlims.laboratory.dto.HistoryDates;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AdminDashboardQueries {
    private final JdbcTemplate jdbc;

    public AdminDashboardQueries(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public long patients() {
        return jdbc.queryForObject("SELECT count(*) FROM patients", Long.class);
    }

    public long awaitingReview() {
        return jdbc.queryForObject("""
                SELECT count(*) FROM test_results r JOIN order_items i ON i.id=r.order_item_id
                JOIN test_orders o ON o.id=i.order_id WHERE r.status='DRAFT' AND o.status<>'CANCELLED'
                """, Long.class);
    }

    public List<DailyOrders> dailyOrders(HistoryDates dates) {
        var counts = new HashMap<LocalDate, Long>();
        jdbc.query("""
                SELECT (created_at AT TIME ZONE 'Asia/Jerusalem')::date AS day,count(*) AS total
                FROM test_orders WHERE created_at>=? AND created_at<? GROUP BY 1
                """, r -> { counts.put(r.getDate("day").toLocalDate(), r.getLong("total")); },
                Timestamp.from(dates.start()), Timestamp.from(dates.end()));
        return dates.fromDate().datesUntil(dates.toDate().plusDays(1))
                .map(d -> new DailyOrders(d, counts.getOrDefault(d, 0L))).toList();
    }

    public List<TestDistribution> distribution(HistoryDates dates) {
        var rows = jdbc.query("""
                SELECT i.lab_test_id,i.test_code_snapshot,i.test_name_snapshot,count(*) AS total
                FROM order_items i JOIN test_orders o ON o.id=i.order_id
                WHERE o.created_at>=? AND o.created_at<?
                GROUP BY i.lab_test_id,i.test_code_snapshot,i.test_name_snapshot
                ORDER BY total DESC,i.test_code_snapshot,i.test_name_snapshot,i.lab_test_id
                """, (r, n) -> new TestDistribution(r.getObject("lab_test_id", UUID.class),
                r.getString("test_code_snapshot"), r.getString("test_name_snapshot"), r.getLong("total"), null),
                Timestamp.from(dates.start()), Timestamp.from(dates.end()));
        long total = rows.stream().mapToLong(TestDistribution::count).sum();
        return rows.stream().map(r -> new TestDistribution(r.labTestId(), r.testCode(), r.testName(), r.count(),
                BigDecimal.valueOf(r.count()).multiply(BigDecimal.valueOf(100))
                        .divide(BigDecimal.valueOf(total), 1, RoundingMode.HALF_UP))).toList();
    }
}
