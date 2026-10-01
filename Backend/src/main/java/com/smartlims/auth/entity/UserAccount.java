package com.smartlims.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "full_name", nullable = false, length = 120)
    private String fullName;

    // The sole canonical identity column: trimmed, ASCII and lowercased before persistence.
    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(name = "user_name", length = 30, unique = true)
    private String userName;

    @Column(name = "phone_number", length = 20)
    private String phoneNumber;

    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private AccountOrigin origin;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    @Column(name = "invitation_accepted_at")
    private Instant invitationAcceptedAt;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "reset_code_hash", length = 255)
    private String resetCodeHash;

    @Column(name = "reset_code_expires_at")
    private Instant resetCodeExpiresAt;

    @Column(name = "reset_code_failed_attempts", nullable = false)
    private int resetCodeFailedAttempts;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public static UserAccount registerPatient(String fullName, String canonicalEmail, String userName,
            String phoneNumber, String passwordHash) {
        UserAccount account = new UserAccount();
        account.fullName = fullName;
        account.email = canonicalEmail;
        account.userName = userName;
        account.phoneNumber = phoneNumber;
        account.passwordHash = passwordHash;
        account.role = Role.PATIENT;
        account.origin = AccountOrigin.PUBLIC_REGISTRATION;
        account.enabled = true;
        return account;
    }

    public void verifyEmail(Instant verifiedAt) {
        this.emailVerifiedAt = verifiedAt;
    }

    public static UserAccount invite(String fullName, String email, String userName, String phoneNumber, Role role) {
        UserAccount account = new UserAccount();
        account.fullName = fullName;
        account.email = email;
        account.userName = userName;
        account.phoneNumber = phoneNumber;
        account.role = role;
        account.origin = AccountOrigin.ADMIN_INVITATION;
        account.enabled = true;
        return account;
    }

    public void acceptInvitation(String hash, Instant now) {
        passwordHash = hash;
        emailVerifiedAt = now;
        invitationAcceptedAt = now;
        clearResetCode();
    }

    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public void setRole(Role role) { this.role = role; }
    public void setProfile(String fullName, String email, String userName, String phoneNumber) {
        this.fullName = fullName;
        this.email = email;
        this.userName = userName;
        this.phoneNumber = phoneNumber;
    }
    public boolean locked(Instant now) { return lockedUntil != null && lockedUntil.isAfter(now); }
    public void failedLogin(Instant now) {
        failedLoginAttempts++;
        if (failedLoginAttempts >= 5) {
            lockedUntil = now.plusSeconds(60);
            failedLoginAttempts = 0;
        }
    }
    public void successfulLogin() { failedLoginAttempts = 0; lockedUntil = null; }
    public void setResetCode(String hash, Instant expiresAt) {
        resetCodeHash = hash;
        resetCodeExpiresAt = expiresAt;
        resetCodeFailedAttempts = 0;
    }
    public void incorrectResetCode() {
        if (++resetCodeFailedAttempts >= 5) clearResetCode();
    }
    public void clearResetCode() {
        resetCodeHash = null;
        resetCodeExpiresAt = null;
        resetCodeFailedAttempts = 0;
    }

    public void markFirstAdministratorInvitation() { origin = AccountOrigin.FIRST_ADMIN_INVITATION; }

    public void changePassword(String passwordHash) {
        this.passwordHash = passwordHash;
        clearResetCode();
    }
}
