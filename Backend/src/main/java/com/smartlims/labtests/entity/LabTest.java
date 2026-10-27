package com.smartlims.labtests.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "lab_tests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LabTest {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Setter @Column(nullable = false, unique = true, length = 30)
    private String code;
    @Setter @Column(nullable = false, length = 150)
    private String name;
    @Setter @Column(columnDefinition = "text")
    private String description;
    @Setter @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;
    @Column(nullable = false, columnDefinition = "char(3)", length = 3)
    @JdbcTypeCode(java.sql.Types.CHAR)
    private String currency = "ILS";
    @Setter @Column(name = "sample_type", nullable = false, length = 40)
    private String sampleType;
    @Setter @Column(name = "preparation_instructions", columnDefinition = "text")
    private String preparationInstructions;
    @Setter @Column(nullable = false)
    private boolean active = true;
    @ElementCollection
    @CollectionTable(name = "lab_test_categories", joinColumns = @JoinColumn(name = "lab_test_id", nullable = false))
    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 30)
    private Set<LabTestCategory> categories = new HashSet<>();
    @CreationTimestamp @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Setter @UpdateTimestamp @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public LabTest(String code, String name, String description, BigDecimal price,
            String sampleType, String preparationInstructions) {
        this.code = code;
        this.name = name;
        this.description = description;
        this.price = price;
        this.sampleType = sampleType;
        this.preparationInstructions = preparationInstructions;
    }
}
