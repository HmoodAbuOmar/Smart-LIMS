package com.smartlims.appointments.service;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.repository.*;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Component;

@Component
public class AppointmentAvailability {
    private final AppointmentSlotRepository slots;
    private final AppointmentRepository appointments;
    public AppointmentAvailability(AppointmentSlotRepository slots,AppointmentRepository appointments) { this.slots=slots; this.appointments=appointments; }
    public AppointmentResponses.Page<AppointmentResponses.Slot> available(UUID patient, UUID excludeAppointment, UUID excludeSlot, AppointmentQuery query) {
        var range=query.range(); var now=Instant.now();
        Specification<AppointmentSlot> filter=(r,q,c)->{
            var occupied=q.subquery(Long.class);var a=occupied.from(Appointment.class);
            occupied.select(c.count(a)).where(c.equal(a.get("slot"),r),a.get("status").in(AppointmentStatus.CONFIRMED,AppointmentStatus.CHECKED_IN));
            var own=q.subquery(Integer.class);var p=own.from(Appointment.class);
            var conflict=c.and(c.equal(p.get("slot"),r),c.equal(p.get("order").get("patient").get("id"),patient),p.get("status").in(AppointmentStatus.CONFIRMED,AppointmentStatus.CHECKED_IN));
            if(excludeAppointment!=null)conflict=c.and(conflict,c.notEqual(p.get("id"),excludeAppointment));
            own.select(c.literal(1)).where(conflict);
            var result=c.and(c.isTrue(r.get("active")),c.greaterThan(r.get("startsAt"),now),c.greaterThanOrEqualTo(r.get("startsAt"),range[0]),c.lessThan(r.get("startsAt"),range[1]),c.lt(occupied,r.get("capacity")),c.not(c.exists(own)));
            if(excludeSlot!=null)result=c.and(result,c.notEqual(r.get("id"),excludeSlot));
            return result;
        };
        return AppointmentMapping.page(AppointmentPages.find(slots,filter,query,Sort.by("startsAt","id")),s->AppointmentMapping.slot(s,appointments.countActiveBySlot(s.getId())));
    }
}
