package com.smartlims.appointments.entity;

import com.smartlims.auth.entity.UserAccount;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.*;

@Entity
@Table(name = "appointment_reschedules")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AppointmentReschedule {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "appointment_id", nullable = false, updatable = false)
    private Appointment appointment;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "old_slot_id", nullable = false, updatable = false)
    private AppointmentSlot oldSlot;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "new_slot_id", nullable = false, updatable = false)
    private AppointmentSlot newSlot;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "changed_by", nullable = false, updatable = false)
    private UserAccount changedBy;
    @Column(name = "from_version", nullable = false, updatable = false)
    private long fromVersion;
    @Column(name = "changed_at", nullable = false, updatable = false)
    private Instant changedAt;

    public AppointmentReschedule(Appointment appointment, AppointmentSlot target, UserAccount actor, Instant at) {
        this.appointment = appointment;
        oldSlot = appointment.getSlot();
        newSlot = target;
        changedBy = actor;
        changedAt = at;
        fromVersion = appointment.getVersion();
    }
}
