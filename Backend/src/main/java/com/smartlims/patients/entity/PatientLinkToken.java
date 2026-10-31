package com.smartlims.patients.entity;

import com.smartlims.auth.entity.UserAccount;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "patient_link_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PatientLinkToken {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64, updatable = false)
    private String tokenHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false, updatable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "issued_by", nullable = false, updatable = false)
    private UserAccount issuedBy;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    public PatientLinkToken(String tokenHash, Patient patient, UserAccount issuedBy, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.patient = patient;
        this.issuedBy = issuedBy;
        this.expiresAt = expiresAt;
    }

    public boolean usableAt(Instant now) {
        return consumedAt == null && revokedAt == null && expiresAt.isAfter(now);
    }

    public void consume(Instant now) {
        consumedAt = now;
    }
}
