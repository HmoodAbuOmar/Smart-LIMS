package com.smartlims.auth.email;

public class MailDeliveryException extends RuntimeException {
    public MailDeliveryException() { super("Email delivery is unavailable."); }
}
