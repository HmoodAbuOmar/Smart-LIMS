CREATE SEQUENCE order_number_seq AS BIGINT START WITH 1 INCREMENT BY 1;

CREATE TABLE test_orders (
    id UUID PRIMARY KEY,
    order_number VARCHAR(30) NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE NO ACTION,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    idempotency_key UUID NOT NULL,
    request_hash CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    currency CHAR(3) NOT NULL DEFAULT 'ILS',
    cancelled_by UUID REFERENCES users(id) ON DELETE NO ACTION,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT test_orders_order_number_key UNIQUE (order_number),
    CONSTRAINT test_orders_creator_idempotency_key UNIQUE (created_by, idempotency_key),
    CONSTRAINT test_orders_order_number_check CHECK (order_number ~ '^ORD-[0-9]{6,19}$'),
    CONSTRAINT test_orders_request_hash_check CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT test_orders_status_check CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT test_orders_currency_check CHECK (currency = 'ILS'),
    CONSTRAINT test_orders_cancellation_state_check CHECK (
        (status = 'CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
        OR (status <> 'CANCELLED' AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    ),
    CONSTRAINT test_orders_cancellation_reason_check CHECK (
        cancellation_reason IS NULL OR (
            cancellation_reason = regexp_replace(cancellation_reason, '^\s+|\s+$', '', 'g')
            AND length(cancellation_reason) BETWEEN 1 AND 1000
        )
    ),
    CONSTRAINT test_orders_cancelled_at_check CHECK (cancelled_at >= created_at)
);

CREATE INDEX test_orders_patient_created_at_id_idx ON test_orders(patient_id, created_at DESC, id ASC);
CREATE INDEX test_orders_patient_status_created_at_id_idx ON test_orders(patient_id, status, created_at DESC, id ASC);
CREATE INDEX test_orders_cancelled_by_idx ON test_orders(cancelled_by);

CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES test_orders(id) ON DELETE NO ACTION,
    lab_test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE NO ACTION,
    test_code_snapshot VARCHAR(30) NOT NULL,
    test_name_snapshot VARCHAR(150) NOT NULL,
    price_at_order NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_items_order_lab_test_key UNIQUE (order_id, lab_test_id),
    CONSTRAINT order_items_test_code_check CHECK (test_code_snapshot ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
    CONSTRAINT order_items_test_name_check CHECK (
        test_name_snapshot = regexp_replace(test_name_snapshot, '^\s+|\s+$', '', 'g')
        AND length(test_name_snapshot) > 0
    ),
    CONSTRAINT order_items_price_check CHECK (price_at_order >= 0 AND price_at_order <> 'NaN'::numeric)
);

CREATE INDEX order_items_lab_test_id_idx ON order_items(lab_test_id);
