package com.smartlims.patients.exception;

public class PatientAuthenticationException extends RuntimeException {
    public PatientAuthenticationException() { super("Authentication is required."); }
}
