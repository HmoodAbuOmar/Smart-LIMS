package com.smartlims.patients.exception;

public class PatientNotFoundException extends RuntimeException {
    public PatientNotFoundException() { super("Patient not found."); }
}
