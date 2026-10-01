package com.smartlims.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "email_action_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EmailActionToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EmailActionPurpose purpose;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public static EmailActionToken verification(UserAccount user, String tokenHash, Instant expiresAt) {
        return create(user, EmailActionPurpose.VERIFY_EMAIL, tokenHash, expiresAt);
    }

    public static EmailActionToken invitation(UserAccount user, String tokenHash, Instant expiresAt) {
        return create(user, EmailActionPurpose.ACCEPT_INVITATION, tokenHash, expiresAt);
    }

    private static EmailActionToken create(UserAccount user, EmailActionPurpose purpose,
            String tokenHash, Instant expiresAt) {
        EmailActionToken token = new EmailActionToken();
        token.user = user;
        token.purpose = purpose;
        token.tokenHash = tokenHash;
        token.expiresAt = expiresAt;
        return token;
    }
}
