package com.smartlims.appointments.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "appointment_slots")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AppointmentSlot {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "starts_at", nullable = false, updatable = false)
    private Instant startsAt;
    @Column(name = "ends_at", nullable = false, updatable = false)
    private Instant endsAt;
    @Setter
    @Column(nullable = false)
    private int capacity;
    @Setter
    @Column(nullable = false)
    private boolean active;
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public AppointmentSlot(Instant start, Instant end, int capacity, boolean active) {
        this.startsAt = start;
        this.endsAt = end;
        this.capacity = capacity;
        this.active = active;
    }
}
