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

    public AccountController(AccountManagementService accounts) {
        this.accounts = accounts;
    }

    @GetMapping
    public List<AccountResponse> all(JwtAuthenticationToken authentication) {
        return accounts.all(authentication);
    }

    @GetMapping("/{id}")
    public AccountResponse get(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        return accounts.get(authentication, id);
    }

    @GetMapping("/page")
    public UserPageResponse page(@RequestParam org.springframework.util.MultiValueMap<String, String> parameters,
                                 JwtAuthenticationToken authentication) {
        return accounts.page(authentication, parameters);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AccountResponse> create(@Valid @RequestBody CreateAccountRequest request,
                                                 JwtAuthenticationToken authentication) {
        return ResponseEntity.ok(accounts.create(authentication, request));
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public AccountResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateAccountRequest request,
                                  JwtAuthenticationToken authentication) {
        return accounts.update(authentication, id, request);
    }

    @PutMapping(path = "/{id}/role", consumes = MediaType.APPLICATION_JSON_VALUE)
    public AccountResponse role(@PathVariable UUID id, @Valid @RequestBody ChangeRoleRequest request,
                                JwtAuthenticationToken authentication) {
        return accounts.changeRole(authentication, id, request.role());
    }

    @PostMapping("/{id}/set-password-email")
    public AuthController.SuccessResponse setPasswordEmail(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        accounts.sendSetPassword(authentication, id);
        return new AuthController.SuccessResponse(true);
    }

    @PatchMapping("/{id}/block")
    public AccountResponse block(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        return accounts.setBlocked(authentication, id, true);
    }

    @PatchMapping(path = "/bulk/block", consumes = MediaType.APPLICATION_JSON_VALUE)
    public List<AccountResponse> blockBulk(@Valid @RequestBody BulkAccountRequest request,
                                           JwtAuthenticationToken authentication) {
        return accounts.setBlockedBulk(authentication, request.ids(), true);
    }

    @PatchMapping(path = "/bulk/unblock", consumes = MediaType.APPLICATION_JSON_VALUE)
    public List<AccountResponse> unblockBulk(@Valid @RequestBody BulkAccountRequest request,
                                             JwtAuthenticationToken authentication) {
        return accounts.setBlockedBulk(authentication, request.ids(), false);
    }

    @PatchMapping("/{id}/unblock")
    public AccountResponse unblock(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        return accounts.setBlocked(authentication, id, false);
    }

    @GetMapping("/{id}/isblocked")
    public boolean isBlocked(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        return accounts.get(authentication, id).blocked();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, JwtAuthenticationToken authentication) {
        accounts.delete(authentication, id);
        return ResponseEntity.noContent().build();
    }
}
