package com.smartlims.appointments.service;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.repository.*;
import com.smartlims.auth.entity.*;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.repository.TestOrderRepository;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service @Validated
public class AppointmentActionService {
    private final AppointmentAccess access;
    private final TestOrderRepository orders;
    private final AppointmentRepository appointments;
    private final AppointmentSlotRepository slots;
    private final AppointmentRescheduleRepository history;
    private final AppointmentAvailability availability;
    private final EntityManager entities;
    public AppointmentActionService(AppointmentAccess access,TestOrderRepository orders,AppointmentRepository appointments,AppointmentSlotRepository slots,AppointmentRescheduleRepository history,AppointmentAvailability availability,EntityManager entities) {
        this.access=access; this.orders=orders; this.appointments=appointments; this.slots=slots; this.history=history; this.availability=availability; this.entities=entities;
    }
    @Transactional(readOnly=true)
    public AppointmentResponses.Page<AppointmentResponses.Slot> alternatives(Authentication actor,String id,AppointmentQuery query) {
        var key=AppointmentQuery.uuid(id,"id");query.range();var account=access.current(actor,Role.PATIENT,Role.ADMIN,Role.RECEPTIONIST);
        var a=appointments.findById(key).orElseThrow(()->AppointmentException.missing("APPOINTMENT"));access.own(account,a.getOrder(),"APPOINTMENT");
        requireMove(a,Instant.now());
        return availability.available(a.getOrder().getPatient().getId(),a.getId(),a.getSlot().getId(),query);
    }
    @Transactional
    public AppointmentResponses.Detail move(Authentication actor,String id,@NotNull @Valid AppointmentRequests.Move body) {
        UUID key=AppointmentQuery.uuid(id,"id"),targetId=AppointmentQuery.uuid(body.slotId(),"slotId");
        var account=access.current(actor,Role.PATIENT,Role.ADMIN,Role.RECEPTIONIST);
        var a=locked(account,key);
        if(a.getVersion()!=body.expectedVersion()) {
            if(body.expectedVersion()<Long.MAX_VALUE && a.getVersion()==body.expectedVersion()+1 && a.getStatus()==AppointmentStatus.CONFIRMED && a.getSlot().getId().equals(targetId)
                && history.findByAppointment_IdAndFromVersion(key,body.expectedVersion()).filter(h->h.getNewSlot().getId().equals(targetId)).isPresent())return AppointmentMapping.detail(a,Instant.now());
            throw AppointmentException.conflict("APPOINTMENT_CHANGED");
        }
        var oldId=a.getSlot().getId();
        for(var slotId:java.util.stream.Stream.of(oldId,targetId).distinct().sorted(Comparator.comparing(UUID::toString)).toList())slots.findForUpdate(slotId).orElseThrow(()->AppointmentException.conflict("APPOINTMENT_SLOT_UNAVAILABLE"));
        var now=Instant.now().truncatedTo(ChronoUnit.MICROS);requireMove(a,now);
        if(oldId.equals(targetId))return AppointmentMapping.detail(a,now);
        var target=slots.findById(targetId).orElseThrow(()->AppointmentException.conflict("APPOINTMENT_SLOT_UNAVAILABLE"));
        if(!target.isActive()||!target.getStartsAt().isAfter(now)||appointments.countBySlot_IdAndStatus(targetId,AppointmentStatus.CONFIRMED)>=target.getCapacity()||appointments.patientConflict(a.getOrder().getPatient().getId(),targetId,key))throw AppointmentException.conflict("APPOINTMENT_SLOT_UNAVAILABLE");
        history.save(new AppointmentReschedule(a,target,account,now));a.move(target);appointments.flush();entities.refresh(a);
        return AppointmentMapping.detail(a,now);
    }
    @Transactional
    public AppointmentResponses.Detail cancel(Authentication actor,String id,@NotNull @Valid AppointmentRequests.Cancel body) {
        var key=AppointmentQuery.uuid(id,"id");var account=access.current(actor,Role.PATIENT,Role.ADMIN,Role.RECEPTIONIST);
        if(account.getRole()!=Role.PATIENT && body.reason()==null)throw AppointmentException.invalid("reason");
        var a=locked(account,key);
        if(a.getStatus()==AppointmentStatus.CANCELLED)return AppointmentMapping.detail(a,Instant.now());
        slots.findForUpdate(a.getSlot().getId()).orElseThrow(()->AppointmentException.missing("APPOINTMENT_SLOT"));
        var now=Instant.now().truncatedTo(ChronoUnit.MICROS);
        if(!a.getSlot().getStartsAt().isAfter(now))throw AppointmentException.conflict("APPOINTMENT_NOT_CHANGEABLE");
        a.cancel(account,now,body.reason());appointments.flush();entities.refresh(a);return AppointmentMapping.detail(a,now);
    }
    private Appointment locked(UserAccount actor,UUID id) {
        // Discover only immutable order ID; never hold appointment/coordination before order.
        var orderId=appointments.orderId(id).orElseThrow(()->AppointmentException.missing("APPOINTMENT"));
        var order=orders.findForUpdate(orderId).orElseThrow(()->AppointmentException.missing("APPOINTMENT"));access.own(actor,order,"APPOINTMENT");
        slots.lockSchedule();
        var a=appointments.findForUpdate(id).orElseThrow(()->AppointmentException.missing("APPOINTMENT"));access.own(actor,a.getOrder(),"APPOINTMENT");return a;
    }
    private void requireMove(Appointment a,Instant now) {
        if(a.getStatus()!=AppointmentStatus.CONFIRMED || !a.getSlot().getStartsAt().isAfter(now) || a.getOrder().getStatus()!=OrderStatus.PENDING)throw AppointmentException.conflict("APPOINTMENT_NOT_CHANGEABLE");
    }
}
