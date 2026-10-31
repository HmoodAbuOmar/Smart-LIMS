package com.smartlims.labtests.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "test_parameters")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TestParameter {
    public enum ValueType {NUMERIC, TEXT}

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lab_test_id", nullable = false, updatable = false)
    private LabTest labTest;
    @Column(nullable = false, length = 30, updatable = false)
    private String code;
    @Setter
    @Column(nullable = false, length = 150)
    private String name;
    @Setter
    @Enumerated(EnumType.STRING)
    @Column(name = "result_type", nullable = false, length = 10)
    private ValueType resultType;
    @Setter
    @Column(length = 40)
    private String unit;
    @Setter
    @Column(length = 100)
    private String method;
    @Setter
    @Column(name = "display_order", nullable = false)
    private int displayOrder;
    @Setter
    @Column(name = "is_required", nullable = false)
    private boolean required;
    @Setter
    @Column(nullable = false)
    private boolean active;
    @Version
    @Column(nullable = false)
    private long version;
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public TestParameter(LabTest test, String code) {
        this.labTest = test;
        this.code = code;
    }
}
