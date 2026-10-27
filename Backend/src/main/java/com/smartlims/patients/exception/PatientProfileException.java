package com.smartlims.patients.exception;

import org.springframework.http.HttpStatus;

public class PatientProfileException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    private PatientProfileException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static PatientProfileException notLinked() {
        return new PatientProfileException(HttpStatus.NOT_FOUND, "PATIENT_PROFILE_NOT_LINKED",
                "No patient profile is linked to this account.");
    }

    public static PatientProfileException conflict() {
        return new PatientProfileException(HttpStatus.CONFLICT, "PATIENT_LINK_CONFLICT",
                "The account or patient profile is already linked.");
    }

    public static PatientProfileException invalidToken() {
        return new PatientProfileException(HttpStatus.BAD_REQUEST, "INVALID_PATIENT_LINK_TOKEN",
                "Invalid or expired patient linking token.");
    }

    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
}
