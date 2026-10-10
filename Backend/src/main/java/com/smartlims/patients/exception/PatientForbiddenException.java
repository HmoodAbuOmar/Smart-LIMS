package com.smartlims.patients.exception;

public class PatientForbiddenException extends RuntimeException {
    public PatientForbiddenException() { super("Access is denied."); }
}
