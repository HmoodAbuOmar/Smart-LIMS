package com.smartlims.orders.entity;

import com.smartlims.labtests.entity.LabTest;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Immutable;

@Entity
@Table(name = "order_items")
@Immutable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderItem {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false, updatable = false)
    private TestOrder order;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lab_test_id", nullable = false, updatable = false)
    private LabTest labTest;
    @Column(name = "test_code_snapshot", nullable = false, length = 30, updatable = false)
    private String testCodeSnapshot;
    @Column(name = "test_name_snapshot", nullable = false, length = 150, updatable = false)
    private String testNameSnapshot;
    @Column(name = "price_at_order", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal priceAtOrder;
    @CreationTimestamp @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    OrderItem(TestOrder order, LabTest test) {
        this.order = order;
        this.labTest = test;
        this.testCodeSnapshot = test.getCode();
        this.testNameSnapshot = test.getName();
        this.priceAtOrder = test.getPrice();
    }
}
