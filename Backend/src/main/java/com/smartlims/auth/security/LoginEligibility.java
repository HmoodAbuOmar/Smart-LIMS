package com.smartlims.auth.security;

import com.smartlims.auth.entity.AccountOrigin;
import com.smartlims.auth.entity.UserAccount;

public final class LoginEligibility {
    private LoginEligibility() {}

    public static boolean eligible(UserAccount user) {
        return user.isEnabled() && user.getEmailVerifiedAt() != null && user.getPasswordHash() != null
                && (user.getOrigin() == AccountOrigin.PUBLIC_REGISTRATION
                    || user.getInvitationAcceptedAt() != null);
    }
}
