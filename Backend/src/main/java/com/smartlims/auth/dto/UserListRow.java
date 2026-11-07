package com.smartlims.auth.dto;

import com.smartlims.auth.entity.AccountStatus;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import java.time.Instant;
import java.util.UUID;

public record UserListRow(UUID id, String fullName, String email, Role role,
                          AccountStatus status, Instant lastLoginAt) {
    public static UserListRow from(UserAccount user) {
        return new UserListRow(user.getId(), user.getFullName(), user.getEmail(), user.getRole(),
                AccountStatus.from(user), user.getLastLoginAt());
    }
}
