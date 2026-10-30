package com.smartlims.results.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.results.dto.HealthTrendResponse;
import com.smartlims.results.dto.HealthTrendResponse.*;
import com.smartlims.results.dto.ResultResponse;
import com.smartlims.results.entity.ResultValue;
import com.smartlims.results.repository.ResultValueRepository;
import java.math.*;
import java.time.*;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Service
public class HealthTrendService {
    private final LaboratoryAccess access;
    private final PatientRepository patients;
    private final ResultValueRepository values;
    private final JsonMapper json;
    private static final Comparator<Measurement> CHRONOLOGICAL = Comparator.comparing(Measurement::measuredAt)
            .thenComparing(m -> m.orderItemId().toString()).thenComparing(m -> m.valueId().toString());

    public HealthTrendService(LaboratoryAccess access, PatientRepository patients,
            ResultValueRepository values, JsonMapper json) {
        this.access = access;
        this.patients = patients;
        this.values = values;
        this.json = json;
    }

    // Include every compatibility dimension in the serialized key, preserving nulls.
    private record SeriesKey(UUID parameterId, String code, String name, String type,
            String unit, String method, List<SpecimenKind> specimens) {}
    private record Point(SeriesKey key, Measurement measurement) {}

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LaboratoryQuery.PageBody<Series> biomarkers(Authentication actor, LaboratoryQuery query) {
        String search = HistoryDates.search(query).toLowerCase(Locale.ROOT);
        var groups = groups(actor);
        var selected = groups.entrySet().stream().filter(entry -> entry.getValue().stream()
                        .anyMatch(p -> matches(p.measurement(), search)))
                .map(entry -> series(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(Series::name).thenComparing(Series::seriesId)).toList();
        return page(selected, query);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public HealthTrendResponse trend(Authentication actor, LaboratoryQuery query) {
        String id = query.get("seriesId", "");
        if (!id.matches("[0-9a-f]{64}")) throw LaboratoryException.invalid("seriesId");
        var dates = HistoryDates.trends(query, LocalDate.now(HistoryDates.ZONE));
        var all = groups(actor).get(id);
        if (all == null) throw LaboratoryException.missing("TREND_SERIES");
        var chart = all.stream().map(Point::measurement).filter(m -> dates.contains(m.measuredAt()))
                .sorted(CHRONOLOGICAL).toList();
        var table = chart.reversed();
        var latest = table.isEmpty() ? null : table.getFirst();
        var previous = table.size() < 2 ? null : table.get(1);
        BigDecimal absolute = null;
        BigDecimal percentage = null;
        if (previous != null && latest.numericComparator() == null && previous.numericComparator() == null) {
            absolute = latest.numericValue().subtract(previous.numericValue());
            if (previous.numericValue().signum() != 0) {
                percentage = absolute.multiply(BigDecimal.valueOf(100)).divide(previous.numericValue(), 6, RoundingMode.HALF_UP);
            }
        }
        return new HealthTrendResponse(series(id, all), HistoryDates.ZONE.getId(), dates.fromDate(), dates.toDate(),
                chart.size(), latest, previous, absolute, percentage, chart, page(table, query));
    }

    private Map<String, List<Point>> groups(Authentication actor) {
        var user = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(user.getId())) throw LaboratoryException.notLinked();
        var groups = new HashMap<String, List<Point>>();
        // Publication snapshots are immutable; parse each result once even for multi-parameter panels.
        var specimens = new HashMap<UUID, List<ResultResponse.Specimen>>();
        for (var value : values.currentNumericForPatient(user.getId())) {
            var result = value.getResult();
            var retained = specimens.computeIfAbsent(result.getId(), ignored -> json.readValue(result.getSpecimenSnapshots(),
                    new TypeReference<List<ResultResponse.Specimen>>() {}));
            var kinds = retained.stream().map(s -> new SpecimenKind(s.sampleType(), s.containerType())).distinct()
                    .sorted(Comparator.comparing(SpecimenKind::sampleType)
                            .thenComparing(SpecimenKind::containerType, Comparator.nullsFirst(Comparator.naturalOrder())))
                    .toList();
            var key = new SeriesKey(value.getParameter().getId(), value.getCode(), value.getName(), value.getType().name(),
                    value.getUnit(), value.getMethod(), kinds);
            String id = LaboratoryInput.hash(json.writeValueAsString(key));
            groups.computeIfAbsent(id, ignored -> new ArrayList<>()).add(new Point(key, measurement(value, retained)));
        }
        return groups;
    }

    private Measurement measurement(ResultValue value, List<ResultResponse.Specimen> specimens) {
        var result = value.getResult();
        var item = result.getItem();
        var order = item.getOrder();
        var links = specimens.stream().map(s -> new VisitLink(s.visitId(), s.visitNumber(), "/api/visits/me/" + s.visitId()))
                .distinct().sorted(Comparator.comparing(v -> v.id().toString())).toList();
        return new Measurement(value.getId(), result.getId(), item.getId(), order.getId(), order.getOrderNumber(),
                item.getTestCodeSnapshot(), item.getTestNameSnapshot(), value.getParameter().getId(), value.getCode(), value.getName(),
                result.getMeasuredAt(), result.getMeasuredAt().atZone(HistoryDates.ZONE).toLocalDate(), result.getPublishedAt(),
                value.getNumericValue(), value.getNumericComparator(), value.getNumericComparator() == null ? value.getNumericValue() : null,
                value.getUnit(), value.getMethod(), value.getReferenceText(), value.getReferenceMin(), value.getReferenceMax(),
                value.getFlag(), value.getNotes(), result.getExplanation(), links, "/api/results/me/" + result.getId());
    }

    private Series series(String id, List<Point> points) {
        var key = points.getFirst().key();
        return new Series(id, key.parameterId(), key.code(), key.name(), key.unit(), key.method(), key.specimens(),
                points.size(), points.stream().map(p -> p.measurement().measuredAt()).max(Comparator.naturalOrder()).orElseThrow());
    }

    private boolean matches(Measurement m, String search) {
        return search.isEmpty() || List.of(m.code(), m.name(), m.testCode(), m.testName()).stream()
                .anyMatch(s -> s.toLowerCase(Locale.ROOT).contains(search));
    }

    private <T> LaboratoryQuery.PageBody<T> page(List<T> all, LaboratoryQuery query) {
        long offset = (long) query.page() * query.size();
        var content = offset >= all.size() ? List.<T>of()
                : all.subList((int) offset, (int) Math.min(offset + query.size(), all.size()));
        int totalPages = (int) (((long) all.size() + query.size() - 1) / query.size());
        return new LaboratoryQuery.PageBody<>(content, query.page(), query.size(), all.size(), totalPages,
                query.page() == 0, (long) query.page() + 1 >= totalPages);
    }
}
