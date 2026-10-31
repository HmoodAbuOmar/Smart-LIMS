package com.smartlims.samples.entity;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.orders.entity.OrderItem;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.*;

@Entity
@Table(name = "specimen_attestations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SpecimenAttestation {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sample_id", nullable = false, updatable = false)
    private Sample sample;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_item_id", nullable = false, updatable = false)
    private OrderItem item;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attested_by", nullable = false, updatable = false)
    private UserAccount attestedBy;
    @Column(name = "attested_at", nullable = false, updatable = false)
    private Instant attestedAt;

    public SpecimenAttestation(Sample sample, OrderItem item, UserAccount actor, Instant at) {
        this.sample = sample;
        this.item = item;
        attestedBy = actor;
        attestedAt = at;
    }
}
