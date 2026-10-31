package com.smartlims.appointments.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "appointment_types")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AppointmentType {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Setter
    @Column(nullable = false, unique = true, length = 30)
    private String code;
    @Setter
    @Column(nullable = false, length = 150)
    private String name;
    @Setter
    @Column(nullable = false)
    private boolean active;
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public AppointmentType(String code, String name, boolean active) {
        this.code = code;
        this.name = name;
        this.active = active;
    }
}
