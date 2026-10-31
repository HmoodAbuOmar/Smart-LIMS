package com.smartlims.notifications.entity;

import com.smartlims.appointments.entity.Appointment;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.patients.entity.Patient;
import com.smartlims.results.entity.TestResult;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.*;

@Entity
@Table(name = "patient_notifications")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PatientNotification {
    @Id
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private TestOrder order;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "appointment_id")
    private Appointment appointment;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "result_id")
    private TestResult result;
    @Column(nullable = false, length = 20)
    private String category;
    @Column(name = "event_type", nullable = false, length = 40)
    private String eventType;
    @Column(name = "event_key", nullable = false, length = 180)
    private String eventKey;
    @Column(nullable = false, length = 150)
    private String title;
    @Column(nullable = false, length = 1000)
    private String message;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "read_at")
    private Instant readAt;
}
