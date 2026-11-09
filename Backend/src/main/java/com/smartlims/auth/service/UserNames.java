package com.smartlims.auth.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class UserNames {
    public String normalize(String supplied) {
        String name = supplied == null ? "" : supplied.strip();
        if (name.length() < 3 || name.length() > 30) {
            throw new AuthRequestException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "Username must contain 3–30 characters after trimming.", "userName");
        }
        return name;
    }

    public static AuthRequestException conflict() {
        return new AuthRequestException(HttpStatus.CONFLICT, "USERNAME_IN_USE",
                "Username already exists.", "userName");
    }
}
