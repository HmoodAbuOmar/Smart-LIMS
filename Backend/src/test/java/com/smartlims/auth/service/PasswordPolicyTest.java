package com.smartlims.auth.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class PasswordPolicyTest {
    private final PasswordPolicy policy = new PasswordPolicy();

    @Test
    void allPasswordFlowsAcceptEightCharactersWithoutComposition() {
        assertDoesNotThrow(() -> policy.validate("abcdefgh"));
        assertDoesNotThrow(() -> policy.validate("abcdefgh", "newPassword"));
        assertDoesNotThrow(() -> policy.validate("12345678"));
        assertDoesNotThrow(() -> policy.validate("!!!!!!!!", "newPassword"));
    }

    @Test
    void allPasswordFlowsEnforceLengthBounds() {
        AuthRequestException tooShort = assertThrows(AuthRequestException.class,
                () -> policy.validate("abcdefg", "newPassword"));
        assertEquals("newPassword", tooShort.getField());
        assertEquals("VALIDATION_ERROR", tooShort.getCode());
        assertThrows(AuthRequestException.class,
                () -> policy.validate("a".repeat(101), "newPassword"));
        assertDoesNotThrow(() -> policy.validate("a".repeat(100)));
    }
}
