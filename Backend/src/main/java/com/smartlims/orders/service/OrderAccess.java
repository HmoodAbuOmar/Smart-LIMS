package com.smartlims.orders.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.LoginEligibility;
import com.smartlims.orders.dto.CreateStaffOrderRequest;
import com.smartlims.orders.exception.OrderException;
import java.util.Arrays;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component
public class OrderAccess {
    private final UserAccountRepository users;

    public OrderAccess(UserAccountRepository users) { this.users = users; }

    // Nonlocking account recheck; callers supply the surrounding transaction.
    public UserAccount current(Authentication actor, Role... roles) {
        if (actor == null || !actor.isAuthenticated()) throw OrderException.unauthenticated();
        if (Arrays.stream(roles).noneMatch(role -> actor.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_" + role)))) throw OrderException.forbidden();
        UUID id;
        try { id = UUID.fromString(actor.getName()); }
        catch (IllegalArgumentException | NullPointerException error) { throw OrderException.unauthenticated(); }
        UserAccount account = users.findById(id).orElseThrow(OrderException::unauthenticated);
        if (!LoginEligibility.eligible(account)) throw OrderException.unauthenticated();
        if (!Arrays.asList(roles).contains(account.getRole())) throw OrderException.forbidden();
        return account;
    }

    public UUID orderId(String value) {
        if (value == null || !value.matches(CreateStaffOrderRequest.UUID_PATTERN)) throw OrderException.invalid("id");
        return UUID.fromString(value);
    }
}
