package com.smartlims.auth.service;

import java.sql.SQLException;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import static org.junit.jupiter.api.Assertions.*;

class AccountConstraintErrorsTest {
    @Test
    void databaseUsernameAndEmailConflictsAreDistinguished() {
        for (String constraint : new String[] {"users_user_name_ci_unique", "users_email_key"}) {
            var violation = new ConstraintViolationException("synthetic unique violation",
                    new SQLException("synthetic", "23505"), constraint);
            var translated = AccountConstraintErrors.translate(new DataIntegrityViolationException("synthetic", violation));
            assertInstanceOf(AuthRequestException.class, translated);
            assertEquals(constraint.contains("user_name") ? "USERNAME_IN_USE" : "EMAIL_IN_USE",
                    ((AuthRequestException) translated).getCode());
        }
        var unknown = new DataIntegrityViolationException("other constraint");
        assertSame(unknown, AccountConstraintErrors.translate(unknown));
    }
}
