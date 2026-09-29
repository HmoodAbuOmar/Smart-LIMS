package com.smartlims.auth.controller;

import com.smartlims.auth.dto.*;
import com.smartlims.auth.service.AccountManagementService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/users", produces = MediaType.APPLICATION_JSON_VALUE)
public class AccountController {
    private final AccountManagementService accounts;
    public AccountController(AccountManagementService accounts) { this.accounts = accounts; }

    @GetMapping
    public List<AccountResponse> all() { return accounts.all(); }

    @GetMapping("/{id}")
    public AccountResponse get(@PathVariable UUID id) { return accounts.get(id); }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AccountResponse> create(@Valid @RequestBody CreateAccountRequest request) {
        return ResponseEntity.ok(accounts.create(request));
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public AccountResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateAccountRequest request) {
        return accounts.update(id, request);
    }

    @PutMapping(path = "/{id}/role", consumes = MediaType.APPLICATION_JSON_VALUE)
    public AccountResponse role(@PathVariable UUID id, @Valid @RequestBody ChangeRoleRequest request,
            JwtAuthenticationToken authentication) {
        return accounts.changeRole(UUID.fromString(authentication.getName()), id, request.role());
    }

    @PostMapping("/{id}/set-password-email")
    public AuthController.SuccessResponse setPasswordEmail(@PathVariable UUID id) {
        accounts.sendSetPassword(id);
        return new AuthController.SuccessResponse(true);
    }

    @PatchMapping("/{id}/block")
    public AccountResponse block(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        return accounts.setBlocked(UUID.fromString(authentication.getName()), id, true);
    }

    @PatchMapping("/{id}/unblock")
    public AccountResponse unblock(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        return accounts.setBlocked(UUID.fromString(authentication.getName()), id, false);
    }

    @GetMapping("/{id}/isblocked")
    public boolean isBlocked(@PathVariable UUID id) { return accounts.get(id).blocked(); }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        accounts.delete(UUID.fromString(authentication.getName()), id);
        return ResponseEntity.noContent().build();
    }
}
