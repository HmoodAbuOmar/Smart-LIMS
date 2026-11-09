CREATE TABLE appointment_types (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
    name VARCHAR(150) NOT NULL CHECK (length(name) BETWEEN 1 AND 150 AND name = regexp_replace(name, '^\s+|\s+$', '', 'g')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
