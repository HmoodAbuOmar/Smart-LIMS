CREATE TABLE appointment_coordination (id INTEGER PRIMARY KEY CHECK (id = 1));
INSERT INTO appointment_coordination(id) VALUES (1);

CREATE TABLE appointment_types (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
    name VARCHAR(150) NOT NULL CHECK (length(name) BETWEEN 1 AND 150 AND name = regexp_replace(name, '^\s+|\s+$', '', 'g')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
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
CREATE TABLE appointments (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES test_orders(id) ON DELETE NO ACTION,
    slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE NO ACTION,
    original_slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE NO ACTION,
    type_id UUID NOT NULL REFERENCES appointment_types(id) ON DELETE NO ACTION,
    type_name_snapshot VARCHAR(150) NOT NULL CHECK (length(type_name_snapshot) BETWEEN 1 AND 150 AND type_name_snapshot = regexp_replace(type_name_snapshot, '^\s+|\s+$', '', 'g')),
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CANCELLED')),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    idempotency_key UUID NOT NULL,
    cancelled_by UUID REFERENCES users(id) ON DELETE NO ACTION,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT CHECK (cancellation_reason IS NULL OR (length(cancellation_reason) BETWEEN 1 AND 1000 AND cancellation_reason = regexp_replace(cancellation_reason, '^\s+|\s+$', '', 'g'))),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(created_by,idempotency_key),
    CHECK ((status = 'CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
        OR (status = 'CONFIRMED' AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)),
    CHECK (cancelled_at >= created_at)
);
CREATE UNIQUE INDEX appointments_active_order_idx ON appointments(order_id) WHERE status = 'CONFIRMED';
CREATE INDEX appointments_order_idx ON appointments(order_id);
CREATE INDEX appointments_slot_status_idx ON appointments(slot_id,status);
CREATE INDEX appointments_type_idx ON appointments(type_id);
CREATE INDEX appointments_original_slot_idx ON appointments(original_slot_id);
CREATE INDEX appointments_cancelled_by_idx ON appointments(cancelled_by);
CREATE TABLE appointment_reschedules (
    id UUID PRIMARY KEY,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE NO ACTION,
    old_slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE NO ACTION,
    new_slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE NO ACTION,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    from_version BIGINT NOT NULL CHECK (from_version >= 0),
    changed_at TIMESTAMPTZ NOT NULL,
    UNIQUE(appointment_id,from_version),
    CHECK (old_slot_id <> new_slot_id)
);
CREATE INDEX appointment_reschedules_actor_idx ON appointment_reschedules(changed_by);
CREATE INDEX appointment_reschedules_old_slot_idx ON appointment_reschedules(old_slot_id);
CREATE INDEX appointment_reschedules_new_slot_idx ON appointment_reschedules(new_slot_id);
