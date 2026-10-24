package com.smartlims.labtests.exception;

import com.smartlims.auth.controller.AuthErrorHandler.ApiError;
import com.smartlims.labtests.controller.LabTestController;
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

@RestControllerAdvice(basePackageClasses = LabTestController.class)
public class LabTestErrorHandler {
    @ExceptionHandler(LabTestException.class)
    ResponseEntity<ApiError> request(LabTestException error, HttpServletResponse response) {
        return respond(error.getStatus(), error.getCode(), error.getMessage(),
                error.getField() == null ? Map.of() : Map.of(error.getField(), error.getMessage()), response);
    }

    @ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
    ResponseEntity<ApiError> constraint(jakarta.validation.ConstraintViolationException error, HttpServletResponse response) {
        Map<String, String> fields = new LinkedHashMap<>();
        error.getConstraintViolations().forEach(violation -> {
            String path = violation.getPropertyPath().toString();
            fields.putIfAbsent(path.substring(path.lastIndexOf('.') + 1), "Invalid value.");
        });
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Please correct the request fields.", fields, response);
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

