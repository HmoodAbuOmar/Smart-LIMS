package com.smartlims.auth.email;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class SmtpVerificationEmailSender implements VerificationEmailSender {
    private final ObjectProvider<JavaMailSender> mailSender;
    private final String from;
    private final String frontendBaseUrl;

    public SmtpVerificationEmailSender(ObjectProvider<JavaMailSender> mailSender,
            @Value("${smartlims.auth.email.from:}") String from,
            @Value("${smartlims.auth.email.frontend-base-url:}") String frontendBaseUrl) {
        this.mailSender = mailSender;
        this.from = from;
        this.frontendBaseUrl = frontendBaseUrl;
    }

    @Override
    public void sendVerification(String recipient, java.util.UUID userId, String token) {
        send(recipient, token, "/verify-email", "Verify your Smart-LIMS email",
                "Open this link to verify your email. The link expires in 24 hours. ",
                "userId=" + userId + "&token=");
    }

    @Override
    public void sendPasswordReset(String recipient, String code) {
        plain(recipient, "Smart-LIMS password reset", "Your reset code is " + code
                + ". It expires in 15 minutes.");
    }

    @Override
    public void sendSetPassword(String recipient, java.util.UUID userId, String token) {
        send(recipient, token, "/set-password", "Set your Smart-LIMS password",
                "Open this link to set your password. ", "userId=" + userId + "&token=");
    }

    @Override
    public void sendPasswordChanged(String recipient) {
        plain(recipient, "Smart-LIMS password changed", "Your password has been changed.");
    }

    @Override
    public void sendRoleChanged(String recipient, String role) {
        plain(recipient, "Smart-LIMS role updated", "Your account role is now " + role + ".");
    }

    private void send(String recipient, String token, String path, String subject, String introduction,
            String queryPrefix) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null || from.isBlank() || frontendBaseUrl.isBlank()) {
            throw new MailDeliveryException();
        }
        URI base;
        try {
            base = URI.create(frontendBaseUrl);
        } catch (IllegalArgumentException e) {
            throw new MailDeliveryException();
        }
        boolean localHttp = "http".equalsIgnoreCase(base.getScheme())
                && ("localhost".equalsIgnoreCase(base.getHost()) || "127.0.0.1".equals(base.getHost()));
        if ((!"https".equalsIgnoreCase(base.getScheme()) && !localHttp)
                || base.getHost() == null || base.getUserInfo() != null
                || base.getQuery() != null || base.getFragment() != null) {
            throw new MailDeliveryException();
        }
        String url = frontendBaseUrl.replaceAll("/+$", "")
                + path + "?" + queryPrefix + URLEncoder.encode(token, StandardCharsets.UTF_8);
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(recipient);
        message.setSubject(subject);
        message.setText(introduction
                + "Opening it does not change your account; submit it on the page.\n\n" + url);
        try {
            sender.send(message);
        } catch (MailException | IllegalArgumentException e) {
            throw new MailDeliveryException();
        }
    }

    private void plain(String recipient, String subject, String body) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null || from.isBlank()) throw new MailDeliveryException();
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(recipient);
        message.setSubject(subject);
        message.setText(body);
        try { sender.send(message); } catch (MailException | IllegalArgumentException e) {
            throw new MailDeliveryException();
        }
    }
}
