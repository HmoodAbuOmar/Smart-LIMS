package com.smartlims.auth.security;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class AccessCookieFactory {
    private final boolean secure;
    private final Duration lifetime;

    public AccessCookieFactory(@Value("${smartlims.auth.browser.secure-cookies:true}") boolean secure,
            @Value("${smartlims.auth.jwt.duration-minutes:60}") long durationMinutes) {
        this.secure = secure;
        this.lifetime = Duration.ofMinutes(durationMinutes);
    }

    public ResponseCookie issued(String jwt) {
        return base(jwt).maxAge(lifetime).build();
    }

    public ResponseCookie cleared() {
        return base("").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from("access_token", value)
                .httpOnly(true).secure(secure).path("/").sameSite("None");
    }
}
