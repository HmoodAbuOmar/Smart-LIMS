package com.smartlims.orders.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class OrderException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;

    public OrderException(HttpStatus status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }

    public static OrderException invalid(String field) {
        return new OrderException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid value.", field);
    }
    public static OrderException unauthenticated() {
        return new OrderException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication is required.", null);
    }
    public static OrderException forbidden() {
        return new OrderException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access is denied.", null);
    }
    public static OrderException notLinked() {
        return new OrderException(HttpStatus.NOT_FOUND, "PATIENT_PROFILE_NOT_LINKED", "No patient profile is linked to this account.", null);
    }
    public static OrderException missingPatient() {
        return new OrderException(HttpStatus.NOT_FOUND, "PATIENT_NOT_FOUND", "Patient not found.", null);
    }
    public static OrderException missingOrder() {
        return new OrderException(HttpStatus.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found.", null);
    }
    public static OrderException notCancellable() {
        return new OrderException(HttpStatus.CONFLICT, "ORDER_NOT_CANCELLABLE", "Only pending orders can be cancelled.", null);
    }
    public static OrderException unavailable() {
        return new OrderException(HttpStatus.CONFLICT, "ORDER_TEST_UNAVAILABLE", "One or more selected tests are unavailable.", "testIds");
    }
    public static OrderException reusedKey() {
        return new OrderException(HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_REUSED", "Idempotency key was already used for a different order request.", "idempotencyKey");
    }
}
