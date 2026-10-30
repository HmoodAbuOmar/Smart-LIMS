package com.smartlims.appointments.entity;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.orders.entity.TestOrder;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity @Table(name = "appointments") @Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Appointment {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "order_id", nullable = false, updatable = false) private TestOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "slot_id", nullable = false) private AppointmentSlot slot;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "original_slot_id", nullable = false, updatable = false) private AppointmentSlot originalSlot;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "type_id", nullable = false, updatable = false) private AppointmentType type;
    @Column(name = "type_name_snapshot", nullable = false, length = 150, updatable = false) private String typeNameSnapshot;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private AppointmentStatus status = AppointmentStatus.CONFIRMED;
    @Version @Column(nullable = false) private long version;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by", nullable = false, updatable = false) private UserAccount createdBy;
    @Column(name = "idempotency_key", nullable = false, updatable = false) private UUID idempotencyKey;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "cancelled_by") private UserAccount cancelledBy;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancellation_reason", columnDefinition = "text") private String cancellationReason;
    @Column(name="checked_in_at") private Instant checkedInAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="checked_in_by") private UserAccount checkedInBy;
    @Column(name="completed_at") private Instant completedAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="completed_by") private UserAccount completedBy;
    @Column(name="no_show_at") private Instant noShowAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="no_show_by") private UserAccount noShowBy;
    @CreationTimestamp @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    public Appointment(TestOrder order, AppointmentSlot slot, AppointmentType type, UserAccount actor, UUID key) {
        this.order = order; this.slot = slot; this.originalSlot = slot; this.type = type;
        this.typeNameSnapshot = type.getName(); this.createdBy = actor; this.idempotencyKey = key;
    }
    public void move(AppointmentSlot target) { this.slot = target; }
    public void checkIn(UserAccount actor,Instant at){status=AppointmentStatus.CHECKED_IN;checkedInBy=actor;checkedInAt=at;}
    public void completeVisit(UserAccount actor,Instant at){status=AppointmentStatus.COMPLETED;completedBy=actor;completedAt=at;}
    public void noShow(UserAccount actor,Instant at){status=AppointmentStatus.NO_SHOW;noShowBy=actor;noShowAt=at;}
    public void cancel(UserAccount actor, Instant at, String reason) {
        status = AppointmentStatus.CANCELLED; cancelledBy = actor; cancelledAt = at; cancellationReason = reason;
    }
}
