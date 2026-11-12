package com.smartlims.orders.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.orders.dto.*;
import com.smartlims.orders.entity.*;
import com.smartlims.orders.repository.TestOrderRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AdminOrderReadService {
    private final OrderAccess access;
    private final TestOrderRepository orders;
    private final EntityManager entities;
    private final com.smartlims.orders.mapper.OrderMapper mapper;

    public AdminOrderReadService(OrderAccess access, TestOrderRepository orders, EntityManager entities,
                                 com.smartlims.orders.mapper.OrderMapper mapper) {
        this.access = access; this.orders = orders; this.entities = entities; this.mapper = mapper;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public OrderDetailResponse get(Authentication actor, String id) {
        access.current(actor, Role.ADMIN);
        return mapper.toDetail(orders.findById(access.orderId(id))
                .orElseThrow(com.smartlims.orders.exception.OrderException::missingOrder));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AdminOrderPage list(Authentication actor, LaboratoryQuery query) {
        access.current(actor, Role.ADMIN);
        var dates = HistoryDates.archive(query);
        var search = HistoryDates.search(query);
        OrderStatus status = null;
        if (query.values().containsKey("status")) {
            try { status = OrderStatus.valueOf(query.get("status", "")); }
            catch (IllegalArgumentException e) { throw LaboratoryException.invalid("status"); }
        }
        final var state = status;
        Specification<TestOrder> filter = (r, q, c) -> filters(r, q, c, dates, state, search);
        String sorting = query.get("sort", "createdAt,desc");
        if (!sorting.matches("(createdAt|updatedAt|orderNumber),(asc|desc)")) throw LaboratoryException.invalid("sort");
        String[] parts = sorting.split(",");
        var page = query.find(orders, filter, Sort.by(Sort.Direction.fromString(parts[1]), parts[0])
                .and(Sort.by(Sort.Direction.DESC, "id")));
        // Aggregate every matched order item once, using the exact same order predicate.
        var c = entities.getCriteriaBuilder();
        var sum = c.createQuery(BigDecimal.class);
        var i = sum.from(OrderItem.class);
        Join<OrderItem, TestOrder> o = i.join("order");
        sum.select(c.sum(i.<BigDecimal>get("priceAtOrder"))).where(filters(o, sum, c, dates, state, search));
        var total = entities.createQuery(sum).getSingleResult();
        var rows = page.getContent().stream().map(order -> {
            var items = order.getItems().stream().sorted(Comparator.comparing(OrderItem::getTestCodeSnapshot).thenComparing(OrderItem::getId))
                    .map(item -> new OrderItemResponse(item.getId(), item.getLabTest().getId(), item.getTestCodeSnapshot(), item.getTestNameSnapshot(), item.getPriceAtOrder().setScale(2))).toList();
            var amount = items.stream().map(OrderItemResponse::priceAtOrder).reduce(new BigDecimal("0.00"), BigDecimal::add);
            return new AdminOrderPage.Row(order.getId(), order.getOrderNumber(), order.getPatient().getId(),
                    order.getPatient().getFullName(), items, amount, order.getCurrency(), null, order.getStatus(), order.getCreatedAt());
        }).toList();
        return new AdminOrderPage(rows, query.page(), query.size(), page.getTotalElements(), page.getTotalPages(),
                page.isFirst(), (long) query.page() + 1 >= page.getTotalPages(), new AdminOrderPage.Summary(page.getTotalElements(),
                total == null ? new BigDecimal("0.00") : total.setScale(2), FinancialSummary.unsupported()));
    }

    private Predicate filters(From<?, TestOrder> r, CommonAbstractCriteria q, CriteriaBuilder c,
                              HistoryDates dates, OrderStatus status, String search) {
        var predicates = new ArrayList<Predicate>();
        if (dates.start() != null) predicates.add(c.greaterThanOrEqualTo(r.get("createdAt"), dates.start()));
        if (dates.end() != null) predicates.add(c.lessThan(r.get("createdAt"), dates.end()));
        if (status != null) predicates.add(c.equal(r.get("status"), status));
        if (!search.isEmpty()) {
            var itemQuery = q.subquery(Integer.class);
            var item = itemQuery.from(OrderItem.class);
            String pattern = "%" + search.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            itemQuery.select(c.literal(1)).where(c.equal(item.get("order"), r), c.like(c.lower(item.get("testNameSnapshot")), pattern, '\\'));
            predicates.add(c.or(c.like(c.lower(r.get("orderNumber")), pattern, '\\'),
                    c.like(c.lower(r.get("patient").get("fullName")), pattern, '\\'), c.exists(itemQuery)));
        }
        return c.and(predicates.toArray(Predicate[]::new));
    }
}
