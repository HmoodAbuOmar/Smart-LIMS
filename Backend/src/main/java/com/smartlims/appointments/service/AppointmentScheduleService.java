package com.smartlims.appointments.service;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.repository.*;
import com.smartlims.auth.entity.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service @Validated
public class AppointmentScheduleService {
    private final AppointmentAccess access;
    private final AppointmentTypeRepository types;
    private final AppointmentSlotRepository slots;
    private final AppointmentRepository appointments;
    public AppointmentScheduleService(AppointmentAccess access,AppointmentTypeRepository types,AppointmentSlotRepository slots,AppointmentRepository appointments) {
        this.access=access; this.types=types; this.slots=slots; this.appointments=appointments;
    }
    @Transactional
    public AppointmentResponses.Type saveType(Authentication actor,String id,@NotNull @Valid AppointmentRequests.Type body) {
        access.current(actor,Role.ADMIN); UUID key=id==null?null:AppointmentQuery.uuid(id,"id");
        slots.lockSchedule();
        if (types.existsByCodeAndIdNot(body.code(),key==null?new UUID(0,0):key)) throw AppointmentException.conflict("APPOINTMENT_SCHEDULE_CONFLICT");
        var type=key==null?new AppointmentType(body.code(),body.name(),body.active()):types.findById(key).orElseThrow(()->AppointmentException.missing("APPOINTMENT_TYPE"));
        type.setCode(body.code()); type.setName(body.name()); type.setActive(body.active());
        return AppointmentMapping.type(types.saveAndFlush(type));
    }
    @Transactional(readOnly=true)
    public AppointmentResponses.Page<AppointmentResponses.Type> types(Authentication actor,AppointmentQuery query) {
        var account=access.current(actor,Role.PATIENT,Role.ADMIN,Role.RECEPTIONIST);
        boolean all=query.bool("includeInactive"); if (all && account.getRole()==Role.PATIENT) throw AppointmentException.forbidden();
        Specification<AppointmentType> filter=(root,q,cb)-> all?cb.conjunction():cb.isTrue(root.get("active"));
        return AppointmentMapping.page(AppointmentPages.find(types,filter,query,Sort.by("code","id")),AppointmentMapping::type);
    }
    @Transactional
    public AppointmentResponses.Slot createSlot(Authentication actor,@NotNull @Valid AppointmentRequests.SlotCreate body) {
        access.current(actor,Role.ADMIN,Role.RECEPTIONIST);
        var start=AppointmentQuery.instant(body.startsAt(),"startsAt"); var end=AppointmentQuery.instant(body.endsAt(),"endsAt");
        if (!end.isAfter(start)) throw AppointmentException.invalid("endsAt");
        slots.lockSchedule();
        if (!start.isAfter(Instant.now())) throw AppointmentException.invalid("startsAt");
        if (slots.overlaps(start,end)) throw AppointmentException.conflict("APPOINTMENT_SCHEDULE_CONFLICT");
        return AppointmentMapping.slot(slots.saveAndFlush(new AppointmentSlot(start,end,body.capacity(),body.active())),0);
    }
    @Transactional
    public AppointmentResponses.Slot updateSlot(Authentication actor,String id,@NotNull @Valid AppointmentRequests.SlotUpdate body) {
        access.current(actor,Role.ADMIN,Role.RECEPTIONIST); var key=AppointmentQuery.uuid(id,"id");
        slots.lockSchedule(); var slot=slots.findForUpdate(key).orElseThrow(()->AppointmentException.missing("APPOINTMENT_SLOT"));
        long count=appointments.countActiveBySlot(key);
        if (body.capacity()<count) throw AppointmentException.conflict("APPOINTMENT_SCHEDULE_CONFLICT");
        slot.setCapacity(body.capacity()); slot.setActive(body.active()); slots.flush();
        return AppointmentMapping.slot(slot,count);
    }
    @Transactional(readOnly=true)
    public AppointmentResponses.Page<AppointmentResponses.Slot> schedule(Authentication actor,AppointmentQuery query) {
        access.current(actor,Role.ADMIN,Role.RECEPTIONIST); var range=query.range();
        Specification<AppointmentSlot> filter=(r,q,c)->c.and(c.greaterThanOrEqualTo(r.get("startsAt"),range[0]),c.lessThan(r.get("startsAt"),range[1]));
        return AppointmentMapping.page(AppointmentPages.find(slots,filter,query,Sort.by("startsAt","id")), s->AppointmentMapping.slot(s,appointments.countActiveBySlot(s.getId())));
    }
}
