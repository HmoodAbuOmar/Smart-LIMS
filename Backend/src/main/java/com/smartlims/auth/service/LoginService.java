package com.smartlims.auth.service;

import com.smartlims.auth.dto.AccountResponse;
import com.smartlims.auth.dto.LoginRequest;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.auth.security.LoginEligibility;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class LoginService {
    private final UserAccountRepository users;
    private final PasswordEncoder passwords;
    private final JwtEncoder encoder;
    private final TransactionTemplate transactions;
    private final Duration lifetime;

    public LoginService(UserAccountRepository users, PasswordEncoder passwords, JwtEncoder encoder,
            TransactionTemplate transactions, @Value("${smartlims.auth.jwt.duration-minutes:60}") long durationMinutes) {
        this.users = users;
        this.passwords = passwords;
        this.encoder = encoder;
        this.transactions = transactions;
        if (durationMinutes < 1 || durationMinutes > 1440) throw new IllegalArgumentException("Invalid JWT duration");
        this.lifetime = Duration.ofMinutes(durationMinutes);
    }

    public IssuedLogin login(LoginRequest request) {
        String identity = request.emailOrUserName().strip().toLowerCase(Locale.ROOT);
        LoginResult result = transactions.execute(status -> authenticate(identity, request.password()));
        if (result == null || result.error != null) {
            throw result == null ? invalid() : result.error;
        }
        UserAccount user = result.user;
        Instant issuedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant expiresAt = issuedAt.plus(lifetime);
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(JwtKeyConfiguration.ISSUER)
                .audience(List.of(JwtKeyConfiguration.AUDIENCE)).subject(user.getId().toString())
                .issuedAt(issuedAt).expiresAt(expiresAt)
                .claim("Role", user.getRole().name()).build();
        String token = encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new IssuedLogin(token, expiresAt, AccountResponse.from(user));
    }

    private LoginResult authenticate(String identity, String password) {
        UserAccount candidate = users.findByEmail(identity)
                .or(() -> users.findByUserNameIgnoreCase(identity)).orElse(null);
        if (candidate == null) return new LoginResult(null, invalid());
        UserAccount user = users.findWithLockById(candidate.getId()).orElse(null);
        if (user == null) return new LoginResult(null, invalid());
        Instant now = Instant.now();
        if (!user.isEnabled()) return new LoginResult(null, new AuthRequestException(HttpStatus.FORBIDDEN,
                "ACCOUNT_BLOCKED", "Your account is blocked.", null));
        if (user.locked(now)) return new LoginResult(null, new AuthRequestException(HttpStatus.FORBIDDEN,
                "ACCOUNT_LOCKED", "Your account is locked.", null));
        if (user.getPasswordHash() == null || password == null || password.length() > 1024
                || !passwords.matches(password, user.getPasswordHash())) {
            user.failedLogin(now);
            return new LoginResult(null, user.locked(now)
                    ? new AuthRequestException(HttpStatus.FORBIDDEN, "ACCOUNT_LOCKED", "Your account is locked.", null)
                    : invalid());
        }
        if (!LoginEligibility.eligible(user)) return new LoginResult(null, new AuthRequestException(
                HttpStatus.BAD_REQUEST, "EMAIL_NOT_CONFIRMED", "Please confirm your email.", null));
        user.successfulLogin();
        return new LoginResult(user, null);
    }

    private AuthRequestException invalid() {
        return new AuthRequestException(HttpStatus.BAD_REQUEST, "INVALID_CREDENTIALS",
                "Invalid email/username or password.", null);
    }

    private record LoginResult(UserAccount user, AuthRequestException error) {}
    public record IssuedLogin(String accessToken, Instant expiresAt, AccountResponse account) {}
}
