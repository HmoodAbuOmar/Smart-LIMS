package com.smartlims.patients.exception;

public class PatientValidationException extends RuntimeException {
    private final String field;

    public PatientValidationException(String field) {
        super("Please correct the request fields.");
        this.field = field;
    }

    public String getField() { return field; }
}
