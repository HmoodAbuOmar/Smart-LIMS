package com.smartlims.auth.email;

public interface VerificationEmailSender {
    void sendVerification(String recipient, java.util.UUID userId, String token);
    void sendPasswordReset(String recipient, String code);
    void sendSetPassword(String recipient, java.util.UUID userId, String token);
    void sendPasswordChanged(String recipient);
    void sendRoleChanged(String recipient, String role);
}
