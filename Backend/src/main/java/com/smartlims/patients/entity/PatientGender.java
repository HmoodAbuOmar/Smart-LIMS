package com.smartlims.patients.entity;

import com.fasterxml.jackson.annotation.JsonCreator;

public enum PatientGender {
    MALE, FEMALE, UNKNOWN;

    @JsonCreator
    public static PatientGender fromJson(Object value) {
        if (value instanceof String text) return valueOf(text);
        throw new IllegalArgumentException("Gender must be an uppercase enum string.");
    }
}
