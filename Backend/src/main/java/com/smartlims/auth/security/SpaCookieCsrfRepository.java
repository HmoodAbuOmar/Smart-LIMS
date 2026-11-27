package com.smartlims.auth.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.DefaultCsrfToken;
import org.springframework.util.StringUtils;

/**
 * Cookie CSRF storage that accepts the readable cookie JavaScript actually sent.
 * A stale second {@code XSRF-TOKEN} must not make the filter compare the header
 * with a different cookie.
 */
public final class SpaCookieCsrfRepository implements CsrfTokenRepository {
    private final CookieCsrfTokenRepository cookies;

    public SpaCookieCsrfRepository(CookieCsrfTokenRepository cookies) {
        this.cookies = cookies;
    }

    @Override
    public CsrfToken generateToken(HttpServletRequest request) {
        return cookies.generateToken(request);
    }

    @Override
    public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
        cookies.saveToken(token, request, response);
    }

    @Override
    public CsrfToken loadToken(HttpServletRequest request) {
        CsrfToken loaded = cookies.loadToken(request);
        if (loaded == null || request.getCookies() == null) return loaded;
        String header = request.getHeader(loaded.getHeaderName());
        if (!StringUtils.hasText(header) || header.equals(loaded.getToken())) return loaded;
        for (Cookie cookie : request.getCookies()) {
            if ("XSRF-TOKEN".equals(cookie.getName()) && header.equals(cookie.getValue())) {
                return new DefaultCsrfToken(loaded.getHeaderName(), loaded.getParameterName(), header);
            }
        }
        return loaded;
    }
}
