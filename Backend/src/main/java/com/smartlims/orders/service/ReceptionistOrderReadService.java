package com.smartlims.orders.service;

import com.smartlims.appointments.repository.AppointmentRepository;
import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.HistoryDates;
import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.orders.dto.ReceptionistOrderResponse;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.mapper.OrderMapper;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.specification.OrderSpecifications;
import com.smartlims.payments.PaymentReadRepository;
import com.smartlims.payments.ReceptionistPaymentResponses.Balance;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ReceptionistOrderReadService {
    private static final BigDecimal ZERO = new BigDecimal("0.00");
    private final OrderAccess access;
    private final TestOrderRepository orders;
    private final AppointmentRepository appointments;
    private final OrderMapper mapper;
    private final PaymentReadRepository payments;

    public ReceptionistOrderReadService(OrderAccess access, TestOrderRepository orders,
                                       AppointmentRepository appointments, OrderMapper mapper, PaymentReadRepository payments) {
        this.access = access;
        this.orders = orders;
        this.appointments = appointments;
        this.mapper = mapper;
        this.payments = payments;
    }

    public LaboratoryQuery.PageBody<ReceptionistOrderResponse.Row> list(Authentication actor, LaboratoryQuery query) {
        access.current(actor, Role.RECEPTIONIST);
        var search = HistoryDates.search(query);
        var sort = query.get("sort", "createdAt,desc");
        if (!sort.matches("(createdAt|orderNumber),(asc|desc)"))
            throw OrderException.invalid("sort");
        var parts = sort.split(",");
        var filter = OrderSpecifications.receptionistSearch(search);
        if (query.bool("bookable"))
            filter = filter.and(OrderSpecifications.bookable());
        var page = query.find(orders, filter,
                Sort.by(Sort.Direction.fromString(parts[1]), parts[0]).and(Sort.by("id")));
        var totals = page.isEmpty() ? Map.<UUID, TestOrderRepository.ItemTotals>of()
                : orders.findItemTotals(page.getContent().stream().map(TestOrder::getId).toList()).stream()
                        .collect(Collectors.toMap(TestOrderRepository.ItemTotals::getOrderId, Function.identity()));
        return LaboratoryQuery.page(page, page.getContent().stream().map(order -> {
            var total = totals.get(order.getId());
            return total == null ? row(order, 0, ZERO)
                    : row(order, Math.toIntExact(total.getTestCount()), total.getTotalAmount());
        }).toList());
    }

    public ReceptionistOrderResponse.Detail get(Authentication actor, String id) {
        access.current(actor, Role.RECEPTIONIST);
        var order = orders.findById(access.orderId(id)).orElseThrow(OrderException::missingOrder);
        var items = mapper.toItems(order);
        var total = items.stream().map(item -> item.priceAtOrder()).reduce(ZERO, BigDecimal::add);
        var bookings = appointments.findByOrder_IdOrderByCreatedAtDescIdDesc(order.getId()).stream()
                .map(a -> new ReceptionistOrderResponse.Appointment(a.getId(), a.getSlot().getStartsAt(),
                        a.getSlot().getEndsAt(), a.getStatus()))
                .toList();
        var patient = order.getPatient();
        var context = new ReceptionistOrderResponse.PatientContext(patient.getDateOfBirth(), patient.getGender(),
                patient.getPhoneNumber());
        var financial = payments.financialForOrder(order.getId(), order.getCurrency());
        var outstanding = order.getStatus() == OrderStatus.CANCELLED
                ? ZERO : Balance.of(total, financial.netConfirmedCollections(), order.getCurrency()).outstanding();
        return new ReceptionistOrderResponse.Detail(row(order, items.size(), total), items, bookings, context,
                financial, outstanding);
    }

    private ReceptionistOrderResponse.Row row(TestOrder order, int testCount, BigDecimal total) {
        var patient = order.getPatient();
        return new ReceptionistOrderResponse.Row(order.getId(), order.getOrderNumber(), patient.getId(),
                patient.getFullName(), patient.getPatientNumber(), order.getCreatedAt(), order.getStatus(), testCount,
                total.setScale(2), order.getCurrency());
    }
}
