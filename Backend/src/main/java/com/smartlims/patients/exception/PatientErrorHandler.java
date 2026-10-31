package com.smartlims.patients.exception;

import com.smartlims.auth.controller.AuthErrorHandler.ApiError;
import com.smartlims.patients.controller.PatientController;
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
import org.springframework.web.ErrorResponse;

@RestControllerAdvice(basePackageClasses = PatientController.class)
public class PatientErrorHandler {
    @ExceptionHandler(PatientProfileException.class)
    ResponseEntity<ApiError> profile(PatientProfileException error, HttpServletResponse response) {
        return respond(error.getStatus(), error.getCode(), error.getMessage(), Map.of(), response);
    }

    @ExceptionHandler(PatientValidationException.class)
    ResponseEntity<ApiError> invalid(PatientValidationException error, HttpServletResponse response) {
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", error.getMessage(),
                Map.of(error.getField(), error.getMessage()), response);
    }

    @ExceptionHandler(PatientNotFoundException.class)
    ResponseEntity<ApiError> missing(PatientNotFoundException error, HttpServletResponse response) {
        return respond(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", error.getMessage(), Map.of(), response);
    }

    @ExceptionHandler(PatientAuthenticationException.class)
    ResponseEntity<ApiError> unauthenticated(PatientAuthenticationException error, HttpServletResponse response) {
        return respond(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", error.getMessage(), Map.of(), response);
    }

    @ExceptionHandler(PatientForbiddenException.class)
    ResponseEntity<ApiError> forbidden(PatientForbiddenException error, HttpServletResponse response) {
        return respond(HttpStatus.FORBIDDEN, "FORBIDDEN", error.getMessage(), Map.of(), response);
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

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception error, HttpServletResponse response) {
        // Preserve framework HTTP statuses (e.g. 405/415) without exposing exception details.
        HttpStatus status = error instanceof ErrorResponse httpError
                ? HttpStatus.valueOf(httpError.getStatusCode().value()) : HttpStatus.INTERNAL_SERVER_ERROR;
        String code = status.is5xxServerError() ? "INTERNAL_SERVER_ERROR" : "INVALID_REQUEST";
        String message = status.is5xxServerError() ? "An unexpected error occurred." : "Invalid request.";
        return respond(status, code, message, Map.of(), response);
    }

    private ResponseEntity<ApiError> respond(HttpStatus status, String code, String message,
                                             Map<String, String> fields, HttpServletResponse response) {
        String requestId = UUID.randomUUID().toString();
        response.setHeader("X-Request-Id", requestId);
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(new ApiError(code, message, fields, requestId));
    }
}
