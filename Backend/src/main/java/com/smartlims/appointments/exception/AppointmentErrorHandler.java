package com.smartlims.appointments.exception;

import com.smartlims.appointments.controller.AppointmentScheduleController;
import com.smartlims.auth.controller.AuthErrorHandler.ApiError;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolationException;

import java.util.*;

import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(basePackageClasses = AppointmentScheduleController.class)
public class AppointmentErrorHandler {
    @ExceptionHandler(AppointmentException.class)
    ResponseEntity<ApiError> request(AppointmentException e, HttpServletResponse response) {
        return respond(e.getStatus(), e.getCode(), e.getMessage(), e.getField() == null ? Map.of() : Map.of(e.getField(), e.getMessage()), response);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException e, HttpServletResponse response) {
        Map<String, String> fields = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> fields.putIfAbsent(f.getField(), "Invalid value."));
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Please correct the request fields.", fields, response);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> constraint(ConstraintViolationException e, HttpServletResponse response) {
        Map<String, String> fields = new LinkedHashMap<>();
        e.getConstraintViolations().forEach(v -> {
            var path = v.getPropertyPath().toString();
            fields.putIfAbsent(path.substring(path.lastIndexOf('.') + 1), "Invalid value.");
        });
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Please correct the request fields.", fields, response);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> json(HttpServletResponse response) {
        return respond(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Invalid request body.", Map.of(), response);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception e, HttpServletResponse response) {
        var status = e instanceof ErrorResponse http ? HttpStatus.valueOf(http.getStatusCode().value()) : HttpStatus.INTERNAL_SERVER_ERROR;
        return respond(status, status.is5xxServerError() ? "INTERNAL_SERVER_ERROR" : "INVALID_REQUEST", status.is5xxServerError() ? "An unexpected error occurred." : "Invalid request.", Map.of(), response);
    }

    private ResponseEntity<ApiError> respond(HttpStatus status, String code, String message, Map<String, String> fields, HttpServletResponse response) {
        String id = UUID.randomUUID().toString();
        response.setHeader("X-Request-Id", id);
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(new ApiError(code, message, fields, id));
    }
}
