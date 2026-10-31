package com.smartlims.orders.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.orders.dto.*;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.mapper.OrderMapper;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.specification.OrderSpecifications;
import com.smartlims.patients.repository.PatientRepository;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class OrderReadService {
    private final OrderAccess access;
    private final PatientRepository patients;
    private final TestOrderRepository orders;
    private final OrderMapper mapper;

    public OrderReadService(OrderAccess access, PatientRepository patients, TestOrderRepository orders, OrderMapper mapper) {
        this.access = access;
        this.patients = patients;
        this.orders = orders;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public OrderDetailResponse getMe(Authentication actor, String id) {
        var orderId = access.orderId(id);
        var account = access.current(actor, Role.PATIENT);
        return mapper.toDetail(orders.findByIdAndPatient_User_Id(orderId, account.getId()).orElseThrow(OrderException::missingOrder));
    }

    @Transactional(readOnly = true)
    public OrderPageResponse listMe(Authentication actor, @NotNull OrderQueryRequest query) {
        var account = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(account.getId()))
            throw OrderException.notLinked();
        var filter = OrderSpecifications.owned(account.getId(), query);
        String[] sort = query.sort().split(",");
        var pageable = PageRequest.of(query.page(), query.size(), Sort.by(Sort.Direction.fromString(sort[1]), sort[0]).and(Sort.by("id")));
        if (pageable.getOffset() > Integer.MAX_VALUE) {
            long total = orders.count(filter);
            if (pageable.getOffset() < total)
                throw OrderException.invalid("page");
            return page(new PageImpl<>(List.of(), pageable, total), Map.of());
        }
        var result = orders.findAll(filter, pageable);
        var totals = result.isEmpty() ? Map.<UUID, TestOrderRepository.ItemTotals>of()
                : orders.findItemTotals(result.getContent().stream().map(order -> order.getId()).toList()).stream()
                .collect(Collectors.toMap(TestOrderRepository.ItemTotals::getOrderId, Function.identity()));
        return page(result, totals);
    }

    private OrderPageResponse page(Page<TestOrder> page, Map<UUID, TestOrderRepository.ItemTotals> totals) {
        return new OrderPageResponse(page.getContent().stream().map(order -> {
            var values = totals.get(order.getId());
            return mapper.toSummary(order, values == null ? 0 : values.getTestCount(),
                    values == null ? new BigDecimal("0.00") : values.getTotalAmount());
        }).toList(), page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(),
                (long) page.getNumber() + 1 >= page.getTotalPages());
    }
}
