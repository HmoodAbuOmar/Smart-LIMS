CREATE TABLE users (
    id UUID PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    user_name VARCHAR(30),
    phone_number VARCHAR(20),
    password_hash VARCHAR(255),
    role VARCHAR(30) NOT NULL,
    origin VARCHAR(30) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    invitation_accepted_at TIMESTAMPTZ,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    reset_code_hash VARCHAR(255),
    reset_code_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'PATIENT', 'RECEPTIONIST', 'LAB_TECHNICIAN')),
    CONSTRAINT users_origin_check CHECK (origin IN ('PUBLIC_REGISTRATION', 'ADMIN_INVITATION', 'FIRST_ADMIN_INVITATION')),
    CONSTRAINT users_email_canonical_check CHECK (
        email = lower(btrim(email)) AND octet_length(email) = char_length(email)
    )
);

CREATE UNIQUE INDEX users_user_name_ci_unique ON users (lower(user_name)) WHERE user_name IS NOT NULL;

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
