package com.smartlims.auth.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class PasswordPolicy {
    public void validate(String password) {
        validate(password, "password");
    }

    public void validate(String password, String field) {
        int codePoints = password == null ? 0 : password.codePointCount(0, password.length());
        if (codePoints < 8 || codePoints > 100) {
            throw new AuthRequestException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Please correct the request fields.", field);
        }
    }
}
