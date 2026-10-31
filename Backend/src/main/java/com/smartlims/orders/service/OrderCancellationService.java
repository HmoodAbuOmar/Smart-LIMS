package com.smartlims.orders.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.appointments.service.AppointmentOrderCancellation;
import com.smartlims.orders.dto.CancelOrderRequest;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.mapper.OrderMapper;
import com.smartlims.orders.repository.TestOrderRepository;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class OrderCancellationService {
    private final OrderAccess access;
    private final TestOrderRepository orders;
    private final OrderMapper mapper;
    private final EntityManager entities;
    private final AppointmentOrderCancellation appointments;
    private final com.smartlims.notifications.service.NotificationPublisher notifications;

    public OrderCancellationService(OrderAccess access, TestOrderRepository orders, OrderMapper mapper, EntityManager entities, AppointmentOrderCancellation appointments,
                                    com.smartlims.notifications.service.NotificationPublisher notifications) {
        this.access = access;
        this.orders = orders;
        this.mapper = mapper;
        this.entities = entities;
        this.appointments = appointments;
        this.notifications = notifications;
    }

    @Transactional
    public OrderDetailResponse cancel(Authentication actor, String id, @NotNull @Valid CancelOrderRequest request) {
        var orderId = access.orderId(id);
        // Read current eligibility/role without introducing account or patient row locks.
        var account = access.current(actor, Role.PATIENT, Role.ADMIN, Role.RECEPTIONIST);
        if (account.getRole() != Role.PATIENT && request.reason() == null)
            throw OrderException.invalid("reason");
        var order = orders.findForUpdate(orderId).orElseThrow(OrderException::missingOrder);
        if (account.getRole() == Role.PATIENT) {
            var owner = order.getPatient().getUser();
            if (owner == null || !owner.getId().equals(account.getId()))
                throw OrderException.missingOrder();
        }
        if (order.getStatus() == OrderStatus.CANCELLED)
            return mapper.toDetail(order);
        if (order.getStatus() != OrderStatus.PENDING)
            throw OrderException.notCancellable();
        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelledBy(account);
        // Match database/ORM microsecond precision instead of rounding a later nanosecond upward.
        order.setCancelledAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
        order.setCancellationReason(request.reason());
        appointments.cancelForOrder(order);
        orders.flush();
        entities.refresh(order);
        notifications.order(order);
        return mapper.toDetail(order);
    }
}
