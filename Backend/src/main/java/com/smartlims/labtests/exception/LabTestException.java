package com.smartlims.labtests.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class LabTestException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String field;

    public LabTestException(HttpStatus status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }

    public static LabTestException invalid(String field) {
        return new LabTestException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid value.", field);
    }

    public static LabTestException missing() {
        return new LabTestException(HttpStatus.NOT_FOUND, "LAB_TEST_NOT_FOUND", "Laboratory test not found.", null);
    }

    public static LabTestException duplicate() {
        return new LabTestException(HttpStatus.CONFLICT, "LAB_TEST_CODE_IN_USE", "A laboratory test with this code already exists.", "code");
    }
}
