package com.smartlims.auth.dto;

import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import java.util.UUID;

public record AccountResponse(UUID id, String userName, String fullName, String email,
        String phoneNumber, Role role, boolean emailConfirmed, boolean blocked) {
    public static AccountResponse from(UserAccount user) {
        return new AccountResponse(user.getId(), user.getUserName(), user.getFullName(), user.getEmail(),
                user.getPhoneNumber(), user.getRole(), user.getEmailVerifiedAt() != null, !user.isEnabled());
    }
}
