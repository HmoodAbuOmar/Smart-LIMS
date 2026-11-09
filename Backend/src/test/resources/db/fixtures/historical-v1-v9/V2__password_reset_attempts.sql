ALTER TABLE users
    ADD COLUMN reset_code_failed_attempts INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT users_reset_code_failed_attempts_check
        CHECK (reset_code_failed_attempts BETWEEN 0 AND 5);
