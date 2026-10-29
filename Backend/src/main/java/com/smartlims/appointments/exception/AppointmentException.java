package com.smartlims.appointments.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class AppointmentException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;
    public AppointmentException(HttpStatus status, String code, String message, String field) {
        super(message); this.status = status; this.code = code; this.field = field;
    }
    public static AppointmentException invalid(String field) { return new AppointmentException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid value.", field); }
    public static AppointmentException missing(String kind) { return new AppointmentException(HttpStatus.NOT_FOUND, kind + "_NOT_FOUND", "Resource not found.", null); }
    public static AppointmentException conflict(String code) { return new AppointmentException(HttpStatus.CONFLICT, code, "The operation conflicts with the current booking or schedule.", null); }
    public static AppointmentException unauthorized() { return new AppointmentException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication is required.", null); }
    public static AppointmentException forbidden() { return new AppointmentException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access is denied.", null); }
    public static AppointmentException notLinked() { return new AppointmentException(HttpStatus.NOT_FOUND, "PATIENT_PROFILE_NOT_LINKED", "No patient profile is linked to this account.", null); }
}
