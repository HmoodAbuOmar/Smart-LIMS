package com.smartlims.auth.service;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

public final class AccountConstraintErrors {
    private AccountConstraintErrors() {}

    public static RuntimeException translate(DataIntegrityViolationException error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation) {
                String name = violation.getConstraintName();
                if ("users_user_name_ci_unique".equals(name)) return UserNames.conflict();
                if ("users_email_key".equals(name)) {
                    return new AuthRequestException(HttpStatus.CONFLICT, "EMAIL_IN_USE",
                            "An account with this email already exists.", "email");
                }
            }
        }
        return error;
    }
}
