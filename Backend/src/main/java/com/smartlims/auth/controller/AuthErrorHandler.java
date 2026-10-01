package com.smartlims.auth.controller;

import com.smartlims.auth.email.MailDeliveryException;
import com.smartlims.auth.service.AuthRequestException;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackages = "com.smartlims.auth.controller")
public class AuthErrorHandler {

    @ExceptionHandler(AuthRequestException.class)
    ResponseEntity<ApiError> request(AuthRequestException error, HttpServletResponse response) {
        Map<String, String> fields = error.getField() == null ? Map.of() : Map.of(error.getField(), error.getMessage());
        return respond(error.getStatus(), error.getCode(), error.getMessage(), fields, response);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException error, HttpServletResponse response) {
        Map<String, String> fields = new LinkedHashMap<>();
        error.getBindingResult().getFieldErrors().forEach(field ->
                fields.putIfAbsent(field.getField(), "Invalid value."));
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Please correct the request fields.", fields, response);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadable(HttpServletResponse response) {
        return respond(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Invalid request body.", Map.of(), response);
    }

    @ExceptionHandler(MailDeliveryException.class)
    ResponseEntity<ApiError> delivery(HttpServletResponse response) {
        return respond(HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_UNAVAILABLE",
                "Email delivery is unavailable. Please try again later.", Map.of(), response);
    }

    private ResponseEntity<ApiError> respond(HttpStatus status, String code, String message,
            Map<String, String> fields, HttpServletResponse response) {
        String requestId = UUID.randomUUID().toString();
        response.setHeader("X-Request-Id", requestId);
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(new ApiError(code, message, fields, requestId));
    }

    public record ApiError(String code, String message, Map<String, String> fieldErrors, String requestId) {}
}
