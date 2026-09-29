package com.smartlims.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.stereotype.Component;

@Component
public class RequestTokenResolver implements BearerTokenResolver {
    private final DefaultBearerTokenResolver bearer = new DefaultBearerTokenResolver();

    public RequestTokenResolver() {
        bearer.setAllowFormEncodedBodyParameter(false);
        bearer.setAllowUriQueryParameter(false);
    }

    @Override
    public String resolve(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path.equals("/api/v1/auth/csrf-token") || path.equals("/api/v1/auth/register")
                || path.equals("/api/v1/auth/confirm-email") || path.equals("/api/v1/auth/login")
                || path.equals("/api/v1/auth/cookie-login") || path.equals("/api/v1/auth/logout")
                || path.equals("/api/v1/auth/forgot-password") || path.equals("/api/v1/auth/reset-password")
                || path.equals("/api/v1/auth/set-password")) {
            return null;
        }
        if (request.getHeader("Authorization") != null) {
            return bearer.resolve(request);
        }
        if (request.getCookies() != null) {
            for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
                if ("access_token".equals(cookie.getName())) return cookie.getValue();
            }
        }
        return null;
    }
}
