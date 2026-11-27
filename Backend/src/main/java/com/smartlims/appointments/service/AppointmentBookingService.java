package com.smartlims.appointments.service;

import com.smartlims.laboratory.service.AuditPublisher;
import static com.smartlims.laboratory.dto.AuditOperation.*;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.repository.*;
import com.smartlims.auth.entity.*;
import com.smartlims.orders.entity.*;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.specification.OrderSpecifications;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.*;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class AppointmentBookingService {
    private final AuditPublisher audit;
    private final AppointmentAccess access;
    private final TestOrderRepository orders;
    private final AppointmentSlotRepository slots;
    private final AppointmentRepository appointments;
    private final AppointmentAvailability availability;
    private final EntityManager entities;
    private final com.smartlims.notifications.service.NotificationPublisher notifications;

    public AppointmentBookingService(AppointmentAccess access, TestOrderRepository orders, AppointmentSlotRepository slots, AppointmentRepository appointments, AppointmentAvailability availability, EntityManager entities,
                                     com.smartlims.notifications.service.NotificationPublisher notifications, AuditPublisher audit) {
        this.audit = audit;
        this.access = access;
        this.orders = orders;
        this.slots = slots;
        this.appointments = appointments;
        this.availability = availability;
        this.entities = entities;
        this.notifications = notifications;
    }

    @Transactional
    public AppointmentResponses.Booking book(Authentication actor, @NotNull @Valid AppointmentRequests.Book body, List<String> keys) {
        var account = access.current(actor, Role.PATIENT, Role.ADMIN, Role.RECEPTIONIST);
        if (keys == null || keys.size() != 1)
            throw AppointmentException.invalid("idempotencyKey");
        UUID key = AppointmentQuery.uuid(keys.getFirst(), "idempotencyKey"), orderId = AppointmentQuery.uuid(body.orderId(), "orderId"), slotId = AppointmentQuery.uuid(body.slotId(), "slotId");
        var order = orders.findForUpdate(orderId).orElseThrow(() -> AppointmentException.missing("ORDER"));
        access.own(account, order, "ORDER");
        slots.lockSchedule();
        var prior = appointments.findByCreatedBy_IdAndIdempotencyKey(account.getId(), key);
        if (prior.isPresent()) {
            var a = prior.get();
            if (!a.getOrder().getId().equals(orderId) || !a.getOriginalSlot().getId().equals(slotId))
                throw AppointmentException.conflict("IDEMPOTENCY_KEY_REUSED");
            return new AppointmentResponses.Booking(AppointmentMapping.detail(a, Instant.now()), false);
        }
        requireBookable(order);
        var slot = slots.findForUpdate(slotId).orElseThrow(() -> AppointmentException.conflict("APPOINTMENT_SLOT_UNAVAILABLE"));
        var now = Instant.now();
        if (!slot.isActive() || !slot.getStartsAt().isAfter(now) || appointments.countActiveBySlot(slotId) >= slot.getCapacity() || appointments.patientConflict(order.getPatient().getId(), slotId, null))
            throw AppointmentException.conflict("APPOINTMENT_SLOT_UNAVAILABLE");
        var appointment = appointments.saveAndFlush(new Appointment(order, slot, account, key));
        entities.refresh(appointment);
        notifications.appointment(appointment, false);
        audit.record(account, APPOINTMENT_BOOK, appointment.getId());
        return new AppointmentResponses.Booking(AppointmentMapping.detail(appointment, now), true);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AppointmentResponses.Page<AppointmentResponses.Slot> slots(Authentication actor, AppointmentQuery query) {
        var account = access.current(actor, Role.PATIENT, Role.ADMIN, Role.RECEPTIONIST);
        UUID orderId = query.uuid("orderId");
        query.range();
        var order = orders.findById(orderId).orElseThrow(() -> AppointmentException.missing("ORDER"));
        access.own(account, order, "ORDER");
        requireBookable(order);
        return availability.available(order.getPatient().getId(), null, null, query);
    }

    private void requireBookable(TestOrder order) {
        if (!orders.exists(OrderSpecifications.bookable()
                .and((root, query, builder) -> builder.equal(root.get("id"), order.getId()))))
            throw AppointmentException.conflict("ORDER_NOT_BOOKABLE");
    }
}
