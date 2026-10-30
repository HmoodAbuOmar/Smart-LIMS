package com.smartlims.visits.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.results.entity.*;
import com.smartlims.results.repository.TestResultRepository;
import com.smartlims.results.service.ResultMapping;
import com.smartlims.samples.entity.Sample;
import com.smartlims.visits.dto.VisitArchiveResponse;
import com.smartlims.visits.entity.Visit;
import com.smartlims.visits.repository.VisitRepository;
import java.util.*;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class VisitArchiveService {
    private final LaboratoryAccess access;
    private final PatientRepository patients;
    private final VisitRepository visits;
    private final TestResultRepository results;
    private final ResultMapping mapping;

    public VisitArchiveService(LaboratoryAccess access, PatientRepository patients,
            VisitRepository visits, TestResultRepository results, ResultMapping mapping) {
        this.access = access;
        this.patients = patients;
        this.visits = visits;
        this.results = results;
        this.mapping = mapping;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LaboratoryQuery.PageBody<VisitArchiveResponse> list(Authentication actor, LaboratoryQuery query) {
        var dates = HistoryDates.archive(query);
        var search = HistoryDates.search(query);
        var testId = query.optionalId("testId");
        ResultValue.Flag flag = null;
        if (query.values().containsKey("resultStatus")) {
            try { flag = ResultValue.Flag.valueOf(query.get("resultStatus", "")); }
            catch (IllegalArgumentException e) { throw LaboratoryException.invalid("resultStatus"); }
        }
        var user = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(user.getId())) throw LaboratoryException.notLinked();
        var selectedFlag = flag;
        Specification<Visit> spec = (v, q, c) -> {
            var published = q.subquery(Integer.class);
            var r = published.from(TestResult.class);
            var sample = published.from(Sample.class);
            var sampleId = r.join("specimenIds");
            var conditions = new ArrayList<jakarta.persistence.criteria.Predicate>();
            conditions.add(c.equal(sample.get("id"), sampleId));
            conditions.add(c.equal(sample.get("visit"), v));
            conditions.add(c.isTrue(r.get("current")));
            conditions.add(c.equal(r.get("status"), ResultStatus.PUBLISHED));
            if (testId != null) conditions.add(c.equal(r.get("item").get("labTest").get("id"), testId));
            if (selectedFlag != null) {
                var value = r.join("values");
                conditions.add(c.equal(value.get("flag"), selectedFlag));
                conditions.add(c.or(c.isNotNull(value.get("numericValue")), c.isNotNull(value.get("textValue"))));
            }
            if (!search.isEmpty()) {
                String pattern = "%" + search.toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                        .replace("%", "\\%").replace("_", "\\_") + "%";
                conditions.add(c.or(c.like(c.lower(v.get("visitNumber")), pattern, '\\'),
                        c.like(c.lower(v.get("order").get("orderNumber")), pattern, '\\'),
                        c.like(c.lower(r.get("item").get("testCodeSnapshot")), pattern, '\\'),
                        c.like(c.lower(r.get("item").get("testNameSnapshot")), pattern, '\\')));
            }
            published.select(c.literal(1)).where(conditions.toArray(jakarta.persistence.criteria.Predicate[]::new));
            return c.and(c.equal(v.get("order").get("patient").get("user").get("id"), user.getId()),
                    c.equal(v.get("status"), Visit.Status.COMPLETED), c.exists(published),
                    dates.start() == null ? c.conjunction() : c.greaterThanOrEqualTo(v.get("arrivedAt"), dates.start()),
                    dates.end() == null ? c.conjunction() : c.lessThan(v.get("arrivedAt"), dates.end()));
        };
        var page = query.find(visits, spec, Sort.by(Sort.Direction.DESC, "arrivedAt").and(Sort.by("id")));
        return LaboratoryQuery.page(page, page.getContent().stream().map(v -> row(v, results.currentForVisit(v.getId()))).toList());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LaboratoryQuery.PageBody<VisitArchiveResponse.TestOption> tests(Authentication actor, LaboratoryQuery query) {
        var search = HistoryDates.search(query).toLowerCase(Locale.ROOT);
        var user = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(user.getId())) throw LaboratoryException.notLinked();
        // Keep a historical choice even if the catalog or parameter has been deactivated.
        var options = new LinkedHashMap<UUID, VisitArchiveResponse.TestOption>();
        results.archivedForPatient(user.getId()).stream().sorted(Comparator.comparing(TestResult::getMeasuredAt).reversed()
                .thenComparing(r -> r.getId().toString())).forEach(r -> {
                    var item = r.getItem();
                    options.putIfAbsent(item.getLabTest().getId(), new VisitArchiveResponse.TestOption(item.getLabTest().getId(),
                            item.getTestCodeSnapshot(), item.getTestNameSnapshot()));
                });
        var selected = options.values().stream().filter(o -> search.isEmpty()
                        || o.testCode().toLowerCase(Locale.ROOT).contains(search) || o.testName().toLowerCase(Locale.ROOT).contains(search))
                .sorted(Comparator.comparing(VisitArchiveResponse.TestOption::testName)
                        .thenComparing(o -> o.labTestId().toString())).toList();
        long offset = (long) query.page() * query.size();
        var content = offset >= selected.size() ? List.<VisitArchiveResponse.TestOption>of()
                : selected.subList((int) offset, (int) Math.min(offset + query.size(), selected.size()));
        int pages = (int) (((long) selected.size() + query.size() - 1) / query.size());
        return new LaboratoryQuery.PageBody<>(content, query.page(), query.size(), selected.size(), pages,
                query.page() == 0, (long) query.page() + 1 >= pages);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public VisitArchiveResponse.Detail get(Authentication actor, String id) {
        var key = LaboratoryInput.uuid(id, "id");
        var user = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(user.getId())) throw LaboratoryException.notLinked();
        var visit = visits.findById(key).orElseThrow(() -> LaboratoryException.missing("VISIT"));
        access.own(user, visit.getOrder(), "VISIT");
        if (visit.getStatus() != Visit.Status.COMPLETED) throw LaboratoryException.missing("VISIT");
        var published = results.currentForVisit(key);
        if (published.isEmpty()) throw LaboratoryException.missing("VISIT");
        return new VisitArchiveResponse.Detail(row(visit, published), published.stream().map(r -> mapping.detail(r, true)).toList());
    }

    private VisitArchiveResponse row(Visit visit, List<TestResult> published) {
        var tests = published.stream().sorted(Comparator.comparing((TestResult r) -> r.getItem().getTestCodeSnapshot())
                .thenComparing(r -> r.getId().toString())).map(r -> {
            var item = r.getItem();
            String url = "/api/results/me/" + r.getId();
            return new VisitArchiveResponse.Test(item.getId(), item.getLabTest().getId(), item.getTestCodeSnapshot(),
                    item.getTestNameSnapshot(), r.getId(), r.getMeasuredAt(), r.getPublishedAt(), flags(r), url, url + "/report");
        }).toList();
        return new VisitArchiveResponse(visit.getId(), visit.getVisitNumber(), visit.getOrder().getId(),
                visit.getOrder().getOrderNumber(), visit.getAppointment() == null ? null : visit.getAppointment().getId(),
                visit.getStatus(), visit.getArrivedAt(), visit.getArrivedAt().atZone(HistoryDates.ZONE).toLocalDate(),
                visit.getCompletedAt(), tests, published.stream().flatMap(r -> flags(r).stream()).distinct().sorted().toList(),
                "/api/visits/me/" + visit.getId());
    }

    private List<ResultValue.Flag> flags(TestResult result) {
        return result.getValues().stream().filter(v -> v.getNumericValue() != null || v.getTextValue() != null)
                .map(ResultValue::getFlag).distinct().sorted().toList();
    }
}
