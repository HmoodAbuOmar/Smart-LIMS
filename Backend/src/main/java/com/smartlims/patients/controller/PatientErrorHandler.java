package com.smartlims.patients.controller;

import com.smartlims.auth.controller.AuthErrorHandler.ApiError;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.ErrorResponse;

@RestControllerAdvice(basePackageClasses = PatientController.class)
public class PatientErrorHandler {
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception error, HttpServletResponse response) {
        // Preserve framework HTTP statuses (e.g. 405/415) without exposing exception details.
        HttpStatus status = error instanceof ErrorResponse httpError
                ? HttpStatus.valueOf(httpError.getStatusCode().value()) : HttpStatus.INTERNAL_SERVER_ERROR;
        String code = status.is5xxServerError() ? "INTERNAL_SERVER_ERROR" : "INVALID_REQUEST";
        String message = status.is5xxServerError() ? "An unexpected error occurred." : "Invalid request.";
        String requestId = UUID.randomUUID().toString();
        response.setHeader("X-Request-Id", requestId);
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(new ApiError(code, message, Map.of(), requestId));
    }
}
