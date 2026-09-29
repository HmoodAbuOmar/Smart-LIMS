package com.smartlims.auth.service;

import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class EmailIdentity {
    private static final Pattern FORMAT = Pattern.compile(
            "[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+");

    public String canonicalize(String supplied) {
        if (supplied == null) {
            throw invalid();
        }
        String email = supplied.strip().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || email.isEmpty() || !email.chars().allMatch(c -> c <= 0x7f)
                || !FORMAT.matcher(email).matches()) {
            throw invalid();
        }
        return email;
    }

    private AuthRequestException invalid() {
        return new AuthRequestException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "Please correct the request fields.", "email");
    }
}
