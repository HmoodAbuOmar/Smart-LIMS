package com.smartlims.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.stereotype.Component;

@Component
public class RequestTokenResolver implements BearerTokenResolver {
    private static final Set<String> PUBLIC_GET = Set.of("/api/auth/csrf-token", "/api/auth/confirm-email");
    private static final Set<String> PUBLIC_POST = Set.of("/api/auth/register", "/api/auth/login",
            "/api/auth/cookie-login", "/api/auth/logout", "/api/auth/forgot-password",
            "/api/auth/reset-password", "/api/auth/set-password");
    private final DefaultBearerTokenResolver bearer = new DefaultBearerTokenResolver();

    public RequestTokenResolver() {
        bearer.setAllowFormEncodedBodyParameter(false);
        bearer.setAllowUriQueryParameter(false);
    }

    @Override
    public String resolve(HttpServletRequest request) {
        if (isPublic(request)) return null;
        return selectedToken(request);
    }

    public static boolean isPublic(HttpServletRequest request) {
        return ("GET".equals(request.getMethod()) && PUBLIC_GET.contains(path(request)))
                || ("POST".equals(request.getMethod()) && PUBLIC_POST.contains(path(request)));
    }

    private static String path(HttpServletRequest request) {
        return request.getRequestURI().substring(request.getContextPath().length());
    }

    private String selectedToken(HttpServletRequest request) {
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

    public boolean requiresCsrf(HttpServletRequest request) {
        if (Set.of("GET", "HEAD", "OPTIONS", "TRACE").contains(request.getMethod())) return false;
        if ("/api/auth/cookie-login".equals(path(request))) return true;
        // An explicit header selects header authentication exclusively, even when a cookie exists.
        // Invalid/missing Bearer credentials never turn cookie-authenticated writes into exemptions.
        if (request.getHeader("Authorization") != null) {
            try {
                if (bearer.resolve(request) != null) return false;
            } catch (OAuth2AuthenticationException invalidHeader) {
                return true;
            }
            return true;
        }
        if ("/api/auth/logout".equals(path(request))) return true;
        return !isPublic(request) || selectedToken(request) != null;
    }
}
