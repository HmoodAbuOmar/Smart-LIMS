CREATE TABLE email_action_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_action_tokens_purpose_check CHECK (
        purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD', 'ACCEPT_INVITATION')
    )
);

CREATE INDEX email_action_tokens_user_purpose_idx ON email_action_tokens(user_id, purpose);
CREATE INDEX email_action_tokens_expires_at_idx ON email_action_tokens(expires_at);
