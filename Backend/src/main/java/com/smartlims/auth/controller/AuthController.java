package com.smartlims.auth.controller;

import com.smartlims.auth.dto.*;
import com.smartlims.auth.security.AccessCookieFactory;
import com.smartlims.auth.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/auth", produces = MediaType.APPLICATION_JSON_VALUE)
public class AuthController {
    private final RegistrationService registration;
    private final LoginService login;
    private final CurrentAccountService current;
    private final PasswordRecoveryService recovery;
    private final AccountManagementService accounts;
    private final AccessCookieFactory cookies;
    private final CookieCsrfTokenRepository csrf;

    public AuthController(RegistrationService registration, LoginService login,
            CurrentAccountService current, PasswordRecoveryService recovery,
            AccountManagementService accounts, AccessCookieFactory cookies,
            CookieCsrfTokenRepository csrf) {
        this.registration = registration;
        this.login = login;
        this.current = current;
        this.recovery = recovery;
        this.accounts = accounts;
        this.cookies = cookies;
        this.csrf = csrf;
    }

    @GetMapping("/csrf-token")
    public ResponseEntity<MessageResponse> csrfToken(HttpServletRequest request, HttpServletResponse response) {
        CsrfToken token = csrf.generateToken(request);
        csrf.saveToken(token, request, response);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new MessageResponse("CSRF token issued."));
    }

    @PostMapping(path = "/register", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<MessageResponse> register(@Valid @RequestBody RegistrationRequest request,
            HttpServletRequest httpRequest) {
        registration.register(request, httpRequest);
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(new MessageResponse("Registration successful. Please check your email to confirm your account."));
    }

    @GetMapping("/confirm-email")
    public ResponseEntity<MessageResponse> confirmEmail(@RequestParam String token, @RequestParam UUID userId) {
        registration.verify(token, userId);
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(new MessageResponse("Email confirmed successfully."));
    }

    @PostMapping(path = "/login", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginService.IssuedLogin issued = login.login(request);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new TokenResponse(issued.accessToken()));
    }

    @PostMapping(path = "/cookie-login", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<CookieLoginResponse> cookieLogin(@Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        LoginService.IssuedLogin issued = login.login(request);
        CsrfToken token = csrf.generateToken(httpRequest);
        csrf.saveToken(token, httpRequest, httpResponse);
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookies.issued(issued.accessToken()).toString())
                .header("Cache-Control", "no-store").body(new CookieLoginResponse(true, issued.account()));
    }

    @GetMapping("/me")
    public ResponseEntity<AccountResponse> me(JwtAuthenticationToken authentication) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(current.current(UUID.fromString(authentication.getName())));
    }

    @PostMapping("/logout")
    public ResponseEntity<SuccessResponse> logout(HttpServletRequest request, HttpServletResponse response) {
        csrf.saveToken(null, request, response);
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookies.cleared().toString())
                .header("Cache-Control", "no-store").body(new SuccessResponse(true));
    }

    @PostMapping(path = "/forgot-password", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<SuccessResponse> forgot(@Valid @RequestBody EmailRequest request) {
        recovery.forgot(request.email());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new SuccessResponse(true));
    }

    @PostMapping(path = "/reset-password", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<SuccessResponse> reset(@Valid @RequestBody ResetPasswordRequest request) {
        recovery.reset(request);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new SuccessResponse(true));
    }

    @PostMapping(path = "/set-password", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<MessageResponse> setPassword(@Valid @RequestBody SetPasswordRequest request) {
        accounts.setPassword(request.userId(), request.token(), request.newPassword());
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(new MessageResponse("Password set successfully."));
    }

    public record TokenResponse(String token) {}
    public record CookieLoginResponse(boolean success, AccountResponse user) {}
    public record SuccessResponse(boolean success) {}
}
