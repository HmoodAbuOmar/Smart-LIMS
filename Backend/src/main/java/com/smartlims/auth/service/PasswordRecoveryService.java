package com.smartlims.auth.service;

import com.smartlims.auth.dto.ResetPasswordRequest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.LoginEligibility;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordRecoveryService {
    private final UserAccountRepository users;
    private final PasswordEncoder passwords;
    private final PasswordPolicy policy;
    private final EmailIdentity identities;
    private final VerificationEmailSender email;
    private final SecureRandom random = new SecureRandom();

    public PasswordRecoveryService(UserAccountRepository users, PasswordEncoder passwords,
            PasswordPolicy policy, EmailIdentity identities, VerificationEmailSender email) {
        this.users = users;
        this.passwords = passwords;
        this.policy = policy;
        this.identities = identities;
        this.email = email;
    }

    @Transactional
    public void forgot(String suppliedEmail) {
        UserAccount user = lockedByEmail(suppliedEmail);
        if (!LoginEligibility.eligible(user)) throw unavailable();
        String code = Integer.toString(1000 + random.nextInt(9000));
        user.setResetCode(passwords.encode(code), Instant.now().plusSeconds(900));
        email.sendPasswordReset(user.getEmail(), code);
    }

    @Transactional
    public void reset(ResetPasswordRequest request) {
        policy.validate(request.newPassword(), "newPassword");
        UserAccount user = lockedByEmail(request.email());
        if (!LoginEligibility.eligible(user) || user.getResetCodeHash() == null
                || user.getResetCodeExpiresAt() == null || !user.getResetCodeExpiresAt().isAfter(Instant.now())
                || !passwords.matches(request.code(), user.getResetCodeHash())) {
            throw new AuthRequestException(HttpStatus.BAD_REQUEST, "INVALID_RESET_CODE",
                    "Invalid or expired reset code.", "code");
        }
        if (passwords.matches(request.newPassword(), user.getPasswordHash())) {
            throw new AuthRequestException(HttpStatus.BAD_REQUEST, "SAME_PASSWORD",
                    "New password must be different from the old password.", "newPassword");
        }
        user.changePassword(passwords.encode(request.newPassword()));
        email.sendPasswordChanged(user.getEmail());
    }

    private UserAccount lockedByEmail(String supplied) {
        String canonical = identities.canonicalize(supplied);
        UserAccount found = users.findByEmail(canonical).orElseThrow(this::unavailable);
        return users.findWithLockById(found.getId()).orElseThrow(this::unavailable);
    }

    private AuthRequestException unavailable() {
        return new AuthRequestException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found.", null);
    }
}
