package com.smartlims.auth.service;

import com.smartlims.auth.dto.RegistrationRequest;
import com.smartlims.auth.dto.RegistrationResponse;
import com.smartlims.auth.email.MailDeliveryException;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.AccountOrigin;
import com.smartlims.auth.entity.EmailActionPurpose;
import com.smartlims.auth.entity.EmailActionToken;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.EmailActionTokenRepository;
import com.smartlims.auth.repository.UserAccountRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
public class RegistrationService {
    private static final Logger log = LoggerFactory.getLogger(RegistrationService.class);
    private static final Duration VERIFICATION_LIFETIME = Duration.ofHours(24);

    private final UserAccountRepository users;
    private final EmailActionTokenRepository tokens;
    private final VerificationEmailSender emailSender;
    private final EmailIdentity emailIdentity;
    private final PasswordPolicy passwordPolicy;
    private final VerificationTokens verificationTokens;
    private final PasswordEncoder passwordEncoder;

    public RegistrationService(UserAccountRepository users, EmailActionTokenRepository tokens,
            VerificationEmailSender emailSender, EmailIdentity emailIdentity, PasswordPolicy passwordPolicy,
            VerificationTokens verificationTokens, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.tokens = tokens;
        this.emailSender = emailSender;
        this.emailIdentity = emailIdentity;
        this.passwordPolicy = passwordPolicy;
        this.verificationTokens = verificationTokens;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public RegistrationResponse register(RegistrationRequest request, HttpServletRequest httpRequest) {
        String email = emailIdentity.canonicalize(request.email());
        passwordPolicy.validate(request.password());
        String fullName = request.fullName().strip();
        if (fullName.isEmpty() || fullName.length() > 120) {
            throw new AuthRequestException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Please correct the request fields.", "fullName");
        }
        if (users.existsByEmail(email)) {
            throw duplicateEmail();
        }
        String userName = request.userName().strip();
        if (users.existsByUserNameIgnoreCase(userName)) {
            throw new AuthRequestException(HttpStatus.CONFLICT, "USERNAME_IN_USE", "Username already exists.", "userName");
        }
        UserAccount user = UserAccount.registerPatient(fullName, email, userName,
                request.phoneNumber().strip(), passwordEncoder.encode(request.password()));
        try {
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            throw duplicateEmail();
        }
        String rawToken = verificationTokens.create();
        tokens.saveAndFlush(EmailActionToken.verification(user, verificationTokens.hash(rawToken),
                Instant.now().plus(VERIFICATION_LIFETIME)));
        emailSender.sendVerification(email, user.getId(), rawToken);
        return new RegistrationResponse(user.getId(), "Account created. Check your email to verify it.");
    }

    @Transactional
    public void verify(String rawToken, java.util.UUID userId) {
        String hash = verificationTokens.hash(rawToken);
        EmailActionToken token = tokens.findByTokenHashAndPurpose(hash, EmailActionPurpose.VERIFY_EMAIL)
                .orElseThrow(this::invalidToken);
        UserAccount user = users.findWithLockById(token.getUser().getId()).orElseThrow(this::invalidToken);
        if (!user.getId().equals(userId) || user.getOrigin() != AccountOrigin.PUBLIC_REGISTRATION
                || user.getEmailVerifiedAt() != null) {
            throw invalidToken();
        }
        Instant now = Instant.now();
        if (tokens.consumeIfValid(token.getId(), EmailActionPurpose.VERIFY_EMAIL, now) != 1) {
            throw invalidToken();
        }
        user.verifyEmail(now);
    }

    private AuthRequestException duplicateEmail() {
        return new AuthRequestException(HttpStatus.CONFLICT, "EMAIL_IN_USE",
                "An account with this email already exists.", "email");
    }

    private AuthRequestException invalidToken() {
        return new AuthRequestException(HttpStatus.BAD_REQUEST, "INVALID_VERIFICATION_TOKEN",
                "This verification link is invalid or expired.", null);
    }
}
