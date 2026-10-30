package com.smartlims.appointments.service;

import com.smartlims.appointments.dto.AppointmentResponses;
import com.smartlims.appointments.entity.*;
import com.smartlims.orders.entity.OrderStatus;
import java.time.*;
import java.util.function.Function;
import org.springframework.data.domain.Page;

public final class AppointmentMapping {
    public static final ZoneId LAB_ZONE = ZoneId.of("Asia/Jerusalem");
    private AppointmentMapping() {}
    public static AppointmentResponses.Type type(AppointmentType t) { return new AppointmentResponses.Type(t.getId(),t.getCode(),t.getName(),t.isActive()); }
    public static AppointmentResponses.Slot slot(AppointmentSlot s,long occupied) { return new AppointmentResponses.Slot(s.getId(),s.getStartsAt(),s.getEndsAt(),s.getCapacity(),s.getCapacity()-occupied,s.isActive(),LAB_ZONE.getId()); }
    public static AppointmentResponses.Detail detail(Appointment a, Instant now) {
        var slot=a.getSlot(); var local=slot.getStartsAt().atZone(LAB_ZONE);
        String reason=a.getStatus()!=AppointmentStatus.CONFIRMED?a.getStatus().name():!slot.getStartsAt().isAfter(now)?"STARTED":null;
        boolean cancel=reason==null, move=cancel && a.getOrder().getStatus()==OrderStatus.PENDING;
        if (cancel && !move) reason="ORDER_NOT_PENDING";
        return new AppointmentResponses.Detail(a.getId(),a.getOrder().getId(),slot.getId(),a.getType().getId(),a.getTypeNameSnapshot(),slot.getStartsAt(),slot.getEndsAt(),LAB_ZONE.getId(),local.toLocalDate(),local.toLocalTime(),local.getOffset().toString(),a.getStatus(),a.getVersion(),move,cancel,reason,a.getCreatedAt(),a.getUpdatedAt(),a.getCancelledAt(),a.getCancellationReason());
    }
    public static <T,R> AppointmentResponses.Page<R> page(Page<T> page, Function<T,R> mapping) {
        return new AppointmentResponses.Page<>(page.getContent().stream().map(mapping).toList(),page.getNumber(),page.getSize(),page.getTotalElements(),page.getTotalPages(),page.isFirst(),(long)page.getNumber()+1>=page.getTotalPages());
    }
}
