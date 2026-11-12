package com.smartlims.laboratory.dto;

/** Closed safe vocabulary. No user-supplied body, identity or clinical text is retained. */
public enum AuditOperation {
    CATALOG_CREATE("CREATE", "catalog definition", "Created a catalog definition. Historical order snapshots were retained."),
    CATALOG_UPDATE("UPDATE", "catalog definition", "Updated a catalog definition. Historical order snapshots were retained."),
    CATALOG_ACTIVATE("ACTIVATE", "catalog definition", "Activated a catalog definition."),
    CATALOG_DEACTIVATE("DEACTIVATE", "catalog definition", "Deactivated a catalog definition. Historical orders were retained."),
    PARAMETER_CREATE("CREATE", "test parameter", "Created a test parameter definition."),
    PARAMETER_UPDATE("UPDATE", "test parameter", "Updated a test parameter definition. Retained result snapshots were unchanged."),
    RANGE_CREATE("CREATE", "reference range", "Created a configured reference range. Retained result snapshots were unchanged."),
    TYPE_CREATE("CREATE", "appointment type", "Created an appointment type. No appointments were changed."),
    TYPE_UPDATE("UPDATE", "appointment type", "Updated an appointment type. Existing appointment snapshots were retained."),
    SLOT_CREATE("CREATE", "booking slot", "Created a booking slot. No existing appointments were changed."),
    SLOT_UPDATE("UPDATE", "booking slot", "Updated booking slot capacity or activity. Existing bookings and times were retained."),
    USER_INVITE("INVITE", "user account", "Created an account invitation."),
    USER_UPDATE("UPDATE", "user account", "Updated account profile fields."),
    USER_ROLE("ROLE_CHANGE", "user account", "Changed an account role."),
    USER_BLOCK("BLOCK", "user account", "Blocked an account."),
    USER_UNBLOCK("UNBLOCK", "user account", "Unblocked an account."),
    USER_DELETE("DELETE", "user account", "Deleted an eligible account. Retained business history was preserved."),
    USER_REISSUE("INVITATION_SENT", "user account", "Reissued an account invitation."),
    PATIENT_CREATE("CREATE", "patient profile", "Created a patient profile."),
    PATIENT_UPDATE("UPDATE", "patient profile", "Updated patient demographics. The account relationship was retained."),
    PATIENT_LINK_ISSUE("LINK_ISSUED", "patient profile", "Issued a patient account link."),
    ORDER_CREATE("CREATE", "order", "Created an order with retained test snapshots."),
    ORDER_CANCEL("CANCEL", "order", "Cancelled an order. Historical items were retained."),
    APPOINTMENT_BOOK("BOOK", "appointment", "Booked an appointment."),
    APPOINTMENT_MOVE("RESCHEDULE", "appointment", "Rescheduled an appointment. Move history was retained."),
    APPOINTMENT_CANCEL("CANCEL", "appointment", "Cancelled an appointment and released its capacity.");

    public final String action;
    public final String entityType;
    public final String summary;
    AuditOperation(String action, String entityType, String summary) {
        this.action = action; this.entityType = entityType; this.summary = summary;
    }
}
