CREATE TABLE patient_link_tokens (
    id UUID PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    issued_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT patient_link_tokens_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT patient_link_tokens_state_check CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX patient_link_tokens_outstanding_idx ON patient_link_tokens(patient_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX patient_link_tokens_issued_by_idx ON patient_link_tokens(issued_by);
CREATE INDEX patient_link_tokens_expires_at_idx ON patient_link_tokens(expires_at);
