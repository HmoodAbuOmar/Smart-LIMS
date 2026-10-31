package com.smartlims.laboratory.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class LaboratoryException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;

    public LaboratoryException(HttpStatus status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }

    public static LaboratoryException invalid(String field) {
        return new LaboratoryException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid value.", field);
    }

    public static LaboratoryException missing(String kind) {
        return new LaboratoryException(HttpStatus.NOT_FOUND, kind + "_NOT_FOUND", "Resource not found.", null);
    }

    public static LaboratoryException conflict(String code) {
        return new LaboratoryException(HttpStatus.CONFLICT, code, "The operation conflicts with the current laboratory workflow.", null);
    }

    public static LaboratoryException forbidden() {
        return new LaboratoryException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access is denied.", null);
    }

    public static LaboratoryException unauthorized() {
        return new LaboratoryException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication is required.", null);
    }

    public static LaboratoryException notLinked() {
        return new LaboratoryException(HttpStatus.NOT_FOUND, "PATIENT_PROFILE_NOT_LINKED", "No patient profile is linked to this account.", null);
    }
}
