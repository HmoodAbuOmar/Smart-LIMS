package com.smartlims.appointments.service;

import com.smartlims.appointments.entity.AppointmentStatus;
import com.smartlims.appointments.repository.*;
import com.smartlims.orders.entity.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AppointmentOrderCancellation {
    private final AppointmentRepository appointments;
    private final AppointmentSlotRepository slots;
    private final com.smartlims.notifications.service.NotificationPublisher notifications;
    public AppointmentOrderCancellation(AppointmentRepository appointments,AppointmentSlotRepository slots,
            com.smartlims.notifications.service.NotificationPublisher notifications) { this.appointments=appointments; this.slots=slots; this.notifications=notifications; }
    /** Caller already holds the order row lock; never opens a separate transaction. */
    @Transactional(propagation=Propagation.MANDATORY)
    public void cancelForOrder(TestOrder order) {
        if(order.getStatus()!=OrderStatus.CANCELLED || order.getCancelledBy()==null || order.getCancelledAt()==null)throw new IllegalStateException("Order cancellation metadata required.");
        slots.lockSchedule();
        appointments.findByOrder_IdAndStatus(order.getId(),AppointmentStatus.CONFIRMED).ifPresent(found->{
            var appointment=appointments.findForUpdate(found.getId()).orElseThrow();
            slots.findForUpdate(appointment.getSlot().getId()).orElseThrow();
            // Required order consistency cascade is independent of direct-action cutoff.
            appointment.cancel(order.getCancelledBy(),order.getCancelledAt(),order.getCancellationReason());
            notifications.appointment(appointment,false);
        });
        appointments.flush();
    }
}
