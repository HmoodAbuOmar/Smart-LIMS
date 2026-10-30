package com.smartlims.patients.service;

import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.repository.AppointmentRepository;
import com.smartlims.appointments.service.AppointmentMapping;
import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.dto.LabTestQueryRequest;
import com.smartlims.labtests.service.LabTestService;
import com.smartlims.laboratory.dto.HistoryDates;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.orders.dto.OrderQueryRequest;
import com.smartlims.orders.service.OrderReadService;
import com.smartlims.patients.dto.PatientDashboardResponse;
import com.smartlims.patients.dto.PatientDashboardResponse.*;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.results.dto.HealthTrendResponse.VisitLink;
import com.smartlims.results.entity.*;
import com.smartlims.results.repository.TestResultRepository;
import com.smartlims.results.service.HealthTrendService;
import com.smartlims.visits.repository.VisitRepository;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class PatientDashboardService {
    private final LaboratoryAccess access;
    private final PatientRepository patients;
    private final OrderReadService orders;
    private final AppointmentRepository appointments;
    private final TestResultRepository results;
    private final VisitRepository visits;
    private final LabTestService catalog;
    private final HealthTrendService trends;

    public PatientDashboardService(LaboratoryAccess access, PatientRepository patients, OrderReadService orders,
            AppointmentRepository appointments, TestResultRepository results, VisitRepository visits,
            LabTestService catalog, HealthTrendService trends) {
        this.access = access;
        this.patients = patients;
        this.orders = orders;
        this.appointments = appointments;
        this.results = results;
        this.visits = visits;
        this.catalog = catalog;
        this.trends = trends;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PatientDashboardResponse getMe(Authentication actor) {
        var account = access.current(actor, Role.PATIENT);
        var patient = patients.findByUser_Id(account.getId()).orElseThrow(LaboratoryException::notLinked);
        var now = Instant.now();
        var recent = orders.listMe(actor, new OrderQueryRequest(null, null, 0, 3, "createdAt,desc"));
        Specification<Appointment> upcoming = (r, q, c) -> c.and(
                c.equal(r.get("order").get("patient").get("user").get("id"), account.getId()),
                c.equal(r.get("status"), AppointmentStatus.CONFIRMED),
                c.greaterThan(r.get("slot").get("startsAt"), now));
        var next = appointments.findAll(upcoming, PageRequest.of(0, 1, Sort.by("slot.startsAt", "id")));
        Specification<TestResult> published = (r, q, c) -> c.and(
                c.equal(r.get("item").get("order").get("patient").get("user").get("id"), account.getId()),
                c.isTrue(r.get("current")), c.equal(r.get("status"), ResultStatus.PUBLISHED));
        var latest = results.findAll(published, PageRequest.of(0, 3,
                Sort.by(Sort.Direction.DESC, "publishedAt").and(Sort.by("id"))));
        var rows = recent.content().stream().map(order -> new RecentOrder(order,
                visits.findByOrder_IdOrderByArrivedAtDescIdAsc(order.id()).stream()
                        .map(v -> new VisitLink(v.getId(), v.getVisitNumber(), "/api/visits/me/" + v.getId())).toList())).toList();
        return new PatientDashboardResponse(patient.getId(), patient.getFullName(), now, HistoryDates.ZONE.getId(),
                recent.totalElements(), next.getTotalElements(), latest.getTotalElements(),
                new Notifications(false, null), rows,
                next.isEmpty() ? null : AppointmentMapping.detail(next.getContent().getFirst(), now),
                latest.getContent().stream().map(this::publication).toList(),
                catalog.list(actor, new LabTestQueryRequest(null, true, 0, 4, "name,asc", null)).content(),
                trends.preview(actor));
    }

    private PublishedResult publication(TestResult result) {
        var item = result.getItem();
        var order = item.getOrder();
        String url = "/api/results/me/" + result.getId();
        return new PublishedResult(result.getId(), item.getId(), order.getId(), order.getOrderNumber(),
                item.getLabTest().getId(), item.getTestCodeSnapshot(), item.getTestNameSnapshot(), result.getPublishedAt(),
                result.getPublishedAt().atZone(HistoryDates.ZONE).toLocalDate(), url, url + "/report");
    }
}
