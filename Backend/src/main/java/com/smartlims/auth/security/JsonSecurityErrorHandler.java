package com.smartlims.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

@Component
public class JsonSecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        write(response, HttpServletResponse.SC_UNAUTHORIZED, "UNAUTHORIZED", "Authentication is required.");
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException exception) throws IOException {
        write(response, HttpServletResponse.SC_FORBIDDEN, "FORBIDDEN", "Access is denied.");
    }

    public void badRequest(HttpServletResponse response) throws IOException {
        write(response, HttpServletResponse.SC_BAD_REQUEST, "INVALID_AUTH_TRANSPORT",
                "Authentication transport is invalid.");
    }

    private void write(HttpServletResponse response, int status, String code, String message) throws IOException {
        String requestId = UUID.randomUUID().toString();
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Request-Id", requestId);
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message
                + "\",\"fieldErrors\":{},\"requestId\":\"" + requestId + "\"}");
    }
}
