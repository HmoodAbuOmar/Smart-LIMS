package com.smartlims.orders.entity;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.patients.entity.Patient;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "test_orders")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TestOrder {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "order_number", nullable = false, unique = true, length = 30, updatable = false)
    private String orderNumber;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false, updatable = false)
    private Patient patient;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private UserAccount createdBy;
    @Column(name = "idempotency_key", nullable = false, updatable = false)
    private UUID idempotencyKey;
    @Column(name = "request_hash", nullable = false, columnDefinition = "char(64)", length = 64, updatable = false)
    @JdbcTypeCode(java.sql.Types.CHAR)
    private String requestHash;
    @Setter @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status = OrderStatus.PENDING;
    @Column(nullable = false, columnDefinition = "char(3)", length = 3, updatable = false)
    @JdbcTypeCode(java.sql.Types.CHAR)
    private String currency = "ILS";
    @Setter @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cancelled_by")
    private UserAccount cancelledBy;
    @Setter @Column(name = "cancelled_at")
    private Instant cancelledAt;
    @Setter @Column(name = "cancellation_reason", columnDefinition = "text")
    private String cancellationReason;
    // Persist the aggregate together; history has no cascade-remove or orphan-removal path.
    @OneToMany(mappedBy = "order", cascade = CascadeType.PERSIST)
    @Getter(AccessLevel.NONE)
    private List<OrderItem> items = new ArrayList<>();
    @CreationTimestamp @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public TestOrder(String orderNumber, Patient patient, UserAccount createdBy,
            UUID idempotencyKey, String requestHash) {
        this.orderNumber = orderNumber;
        this.patient = patient;
        this.createdBy = createdBy;
        this.idempotencyKey = idempotencyKey;
        this.requestHash = requestHash;
    }

    public List<OrderItem> getItems() {
        return Collections.unmodifiableList(items);
    }

    // Called while assembling a new aggregate, under the service's catalog snapshot locks.
    public void addItem(LabTest test) {
        if (createdAt != null) throw new IllegalStateException("Persisted order items cannot be changed.");
        items.add(new OrderItem(this, test));
    }
}
