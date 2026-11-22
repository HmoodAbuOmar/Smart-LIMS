package com.smartlims.auth.entity;

public enum AccountStatus {
    BLOCKED, INVITED, PENDING_VERIFICATION, ACTIVE;

    public static AccountStatus from(UserAccount user) {
        if (!user.isEnabled())
            return BLOCKED;
        if (user.getOrigin() != AccountOrigin.PUBLIC_REGISTRATION && user.getInvitationAcceptedAt() == null)
            return INVITED;
        return user.getEmailVerifiedAt() == null ? PENDING_VERIFICATION : ACTIVE;
    }
}
