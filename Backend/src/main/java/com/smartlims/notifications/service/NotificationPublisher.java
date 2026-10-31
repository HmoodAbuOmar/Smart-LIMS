package com.smartlims.notifications.service;

import com.smartlims.appointments.entity.Appointment;
import com.smartlims.notifications.repository.PatientNotificationRepository;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.results.entity.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Durable in-app records participate in the source transaction, including rollback. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class NotificationPublisher {
    private final PatientNotificationRepository notifications;
    public NotificationPublisher(PatientNotificationRepository notifications) { this.notifications = notifications; }

    public void order(TestOrder order) {
        String type = "ORDER_" + (order.getStatus().name().equals("PENDING") ? "CREATED" : order.getStatus().name());
        String title = type.equals("ORDER_CREATED") ? "Order created" : "Order status updated";
        notifications.insert(order.getPatient().getId(), order.getId(), null, null, "ORDERS", type,
                type + ":" + order.getId(), title, "Order " + order.getOrderNumber() + " is " + order.getStatus().name() + ".");
    }

    public void appointment(Appointment appointment, boolean rescheduled) {
        String type = "APPOINTMENT_" + (rescheduled ? "RESCHEDULED" : appointment.getStatus().name());
        var order = appointment.getOrder();
        String key = type + ":" + appointment.getId() + (rescheduled ? ":" + appointment.getVersion() : "");
        String title = "Appointment " + (rescheduled ? "rescheduled" : appointment.getStatus().name().toLowerCase(java.util.Locale.ROOT).replace('_', ' '));
        notifications.insert(order.getPatient().getId(), order.getId(), appointment.getId(), null, "APPOINTMENTS", type,
                key, title, "Your appointment for order " + order.getOrderNumber() + " was updated.");
    }

    public void publication(TestResult result) {
        if (result.getStatus() != ResultStatus.PUBLISHED) throw new IllegalStateException("Publication required");
        var order = result.getItem().getOrder();
        String type = result.getPrevious() == null ? "RESULT_PUBLISHED" : "RESULT_CORRECTED";
        notifications.insert(order.getPatient().getId(), order.getId(), null, result.getId(), "RESULTS", type,
                type + ":" + result.getId(), result.getPrevious() == null ? "Your results are ready" : "Your results were corrected",
                "Published results for " + result.getItem().getTestNameSnapshot() + " are available.");
    }
}
