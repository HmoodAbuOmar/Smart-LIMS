package com.smartlims.laboratory.dto;

import com.smartlims.laboratory.exception.LaboratoryException;

import java.time.*;
import java.time.format.DateTimeParseException;

/**
 * Inclusive local dates translated to a half-open instant range, including DST.
 */
public record HistoryDates(LocalDate fromDate, LocalDate toDate) {
    public static final ZoneId ZONE = ZoneId.of("Asia/Jerusalem");

    public HistoryDates {
        if (fromDate != null && toDate != null && fromDate.isAfter(toDate)) {
            throw LaboratoryException.invalid("toDate");
        }
    }

    public static HistoryDates archive(LaboratoryQuery query) {
        return new HistoryDates(date(query, "fromDate"), date(query, "toDate"));
    }

    public static HistoryDates trends(LaboratoryQuery query, LocalDate today) {
        String period = query.get("period", "6M");
        if (period.equals("CUSTOM")) {
            var from = date(query, "fromDate");
            var to = date(query, "toDate");
            if (from == null)
                throw LaboratoryException.invalid("fromDate");
            if (to == null)
                throw LaboratoryException.invalid("toDate");
            return new HistoryDates(from, to);
        }
        for (String field : new String[]{"fromDate", "toDate"}) {
            if (query.values().containsKey(field))
                throw LaboratoryException.invalid(field);
        }
        return new HistoryDates(switch (period) {
            case "1M" -> today.minusMonths(1);
            case "3M" -> today.minusMonths(3);
            case "6M" -> today.minusMonths(6);
            case "1Y" -> today.minusYears(1);
            case "ALL" -> null;
            default -> throw LaboratoryException.invalid("period");
        }, today);
    }

    public Instant start() {
        return fromDate == null ? null : fromDate.atStartOfDay(ZONE).toInstant();
    }

    public Instant end() {
        return toDate == null ? null : toDate.plusDays(1).atStartOfDay(ZONE).toInstant();
    }

    public boolean contains(Instant at) {
        return (start() == null || !at.isBefore(start())) && (end() == null || at.isBefore(end()));
    }

    public static String search(LaboratoryQuery query) {
        var search = query.get("search", "").strip();
        if (search.length() > 150)
            throw LaboratoryException.invalid("search");
        return search;
    }

    private static LocalDate date(LaboratoryQuery query, String field) {
        if (!query.values().containsKey(field))
            return null;
        String value = query.get(field, "");
        try {
            if (!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))
                throw LaboratoryException.invalid(field);
            var date = LocalDate.parse(value);
            if (date.getYear() == 0)
                throw LaboratoryException.invalid(field);
            return date;
        } catch (DateTimeParseException e) {
            throw LaboratoryException.invalid(field);
        }
    }
}
