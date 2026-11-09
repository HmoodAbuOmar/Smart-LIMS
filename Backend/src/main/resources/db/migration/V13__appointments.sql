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
