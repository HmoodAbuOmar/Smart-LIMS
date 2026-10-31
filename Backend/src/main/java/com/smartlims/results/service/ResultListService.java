package com.smartlims.results.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.entity.*;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.orders.entity.*;
import com.smartlims.orders.repository.OrderItemRepository;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.results.dto.ResultListRow;
import com.smartlims.results.entity.*;
import com.smartlims.results.repository.TestResultRepository;
import com.smartlims.visits.repository.VisitRepository;

import java.time.ZoneId;
import java.util.*;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class ResultListService {
    private final LaboratoryAccess access;
    private final OrderItemRepository items;
    private final TestResultRepository results;
    private final VisitRepository visits;
    private final PatientRepository patients;

    public ResultListService(LaboratoryAccess access, OrderItemRepository items, TestResultRepository results, VisitRepository visits, PatientRepository patients) {
        this.access = access;
        this.items = items;
        this.results = results;
        this.visits = visits;
        this.patients = patients;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LaboratoryQuery.PageBody<ResultListRow> listMe(Authentication actor, LaboratoryQuery query) {
        String tab = query.get("tab", "ALL");
        if (!Set.of("ALL", "AVAILABLE", "PENDING").contains(tab))
            throw LaboratoryException.invalid("tab");
        var search = query.get("search", "").strip();
        if (search.length() > 150)
            throw LaboratoryException.invalid("search");
        LabTestCategory category = null;
        if (query.values().containsKey("category")) {
            try {
                category = LabTestCategory.valueOf(query.get("category", null));
            } catch (IllegalArgumentException e) {
                throw LaboratoryException.invalid("category");
            }
        }
        var user = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(user.getId()))
            throw LaboratoryException.notLinked();
        final var filterCategory = category;
        Specification<OrderItem> spec = (r, q, c) -> {
            var published = q.subquery(Integer.class);
            var result = published.from(TestResult.class);
            published.select(c.literal(1)).where(c.equal(result.get("item"), r), c.isTrue(result.get("current")));
            var available = c.exists(published);
            var pending = c.and(c.not(available), c.notEqual(r.get("order").get("status"), OrderStatus.CANCELLED));
            var group = switch (tab) {
                case "AVAILABLE" -> available;
                case "PENDING" -> pending;
                default -> c.or(available, pending);
            };
            var member = c.conjunction();
            if (filterCategory != null) {
                var membership = q.subquery(Integer.class);
                var test = membership.from(LabTest.class);
                var cat = test.join("categories");
                membership.select(c.literal(1)).where(c.equal(test.get("id"), r.get("labTest").get("id")), c.equal(cat, filterCategory));
                member = c.exists(membership);
            }
            String pattern = "%" + search.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            return c.and(c.equal(r.get("order").get("patient").get("user").get("id"), user.getId()), group, member, search.isEmpty() ? c.conjunction() : c.like(c.lower(r.get("testNameSnapshot")), pattern, '\\'));
        };
        var page = query.find(items, spec, Sort.by(Sort.Direction.DESC, "order.createdAt").and(Sort.by("id")));
        return LaboratoryQuery.page(page, page.getContent().stream().map(this::row).toList());
    }

    public record WorkItem(UUID orderItemId, UUID orderId, String orderNumber, OrderStatus orderStatus, UUID patientId,
                           String patientNumber, String patientName, String testName, UUID currentResultId,
                           UUID workingResultId, ResultStatus workingState) {
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LaboratoryQuery.PageBody<WorkItem> work(Authentication actor, LaboratoryQuery query) {
        access.clinical(actor);
        var orderId = query.optionalId("orderId");
        Specification<OrderItem> spec = (r, q, c) -> c.and(c.notEqual(r.get("order").get("status"), OrderStatus.CANCELLED), orderId == null ? c.conjunction() : c.equal(r.get("order").get("id"), orderId));
        var page = query.find(items, spec, Sort.by(Sort.Direction.DESC, "order.createdAt").and(Sort.by("id")));
        return LaboratoryQuery.page(page, page.getContent().stream().map(i -> {
            var current = results.findByItem_IdAndCurrentTrue(i.getId());
            var working = results.findByItem_IdOrderByVersionNumberDesc(i.getId()).stream().filter(r -> r.getStatus() != ResultStatus.PUBLISHED).findFirst();
            var p = i.getOrder().getPatient();
            return new WorkItem(i.getId(), i.getOrder().getId(), i.getOrder().getOrderNumber(), i.getOrder().getStatus(), p.getId(), p.getPatientNumber(), p.getFullName(), i.getTestNameSnapshot(), current.map(r -> r.getId()).orElse(null), working.map(r -> r.getId()).orElse(null), working.map(TestResult::getStatus).orElse(null));
        }).toList());
    }

    private ResultListRow row(OrderItem i) {
        var current = results.findByItem_IdAndCurrentTrue(i.getId());
        var links = visits.forItem(i.getId()).stream().map(v -> v.getId()).distinct().toList();
        var at = current.map(TestResult::getPublishedAt).orElse(null);
        return new ResultListRow(i.getId(), i.getOrder().getId(), i.getOrder().getOrderNumber(), i.getTestCodeSnapshot(), i.getTestNameSnapshot(), current.map(r -> r.getId()).orElse(null), at == null ? null : at.atZone(ZoneId.of("Asia/Jerusalem")).toLocalDate(), at, current.isPresent() ? "PUBLISHED" : "PENDING", i.getLabTest().getCategories().stream().sorted().toList(), current.isPresent(), current.isPresent(), !links.isEmpty(), links);
    }
}
