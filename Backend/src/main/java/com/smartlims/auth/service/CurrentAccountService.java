package com.smartlims.auth.service;

import com.smartlims.auth.dto.AccountResponse;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.LoginEligibility;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CurrentAccountService {
    private final UserAccountRepository users;

    public CurrentAccountService(UserAccountRepository users) {
        this.users = users;
    }

    @Transactional(readOnly = true)
    public AccountResponse current(UUID id) {
        UserAccount user = users.findById(id).orElseThrow(this::unavailable);
        if (!LoginEligibility.eligible(user)) {
            throw unavailable();
        }
        return AccountResponse.from(user);
    }

    private AuthRequestException unavailable() {
        return new AuthRequestException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED",
                "Authentication is required.", null);
    }
}
