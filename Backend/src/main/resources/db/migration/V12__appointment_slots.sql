CREATE TABLE appointment_slots (
    id UUID PRIMARY KEY,
    starts_at TIMESTAMPTZ NOT NULL UNIQUE,
    ends_at TIMESTAMPTZ NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_at > starts_at),
    EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&)
);
