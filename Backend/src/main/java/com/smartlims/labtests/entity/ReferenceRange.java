package com.smartlims.labtests.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "reference_ranges")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReferenceRange {
    public enum Applicability {MALE, FEMALE, ANY}

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "parameter_id", nullable = false, updatable = false)
    private TestParameter parameter;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 6, updatable = false)
    private Applicability applicability;
    @Column(name = "min_age_days", updatable = false)
    private Integer minAgeDays;
    @Column(name = "max_age_days", updatable = false)
    private Integer maxAgeDays;
    @Column(name = "lower_limit", precision = 38, scale = 12, updatable = false)
    private BigDecimal lowerLimit;
    @Column(name = "upper_limit", precision = 38, scale = 12, updatable = false)
    private BigDecimal upperLimit;
    @Column(name = "valid_from", updatable = false)
    private LocalDate validFrom;
    @Column(name = "valid_to", updatable = false)
    private LocalDate validTo;
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public ReferenceRange(TestParameter parameter, Applicability applicability, Integer minAgeDays,
                          Integer maxAgeDays, BigDecimal lowerLimit, BigDecimal upperLimit,
                          LocalDate validFrom, LocalDate validTo) {
        this.parameter = parameter;
        this.applicability = applicability;
        this.minAgeDays = minAgeDays;
        this.maxAgeDays = maxAgeDays;
        this.lowerLimit = lowerLimit;
        this.upperLimit = upperLimit;
        this.validFrom = validFrom;
        this.validTo = validTo;
    }
}
