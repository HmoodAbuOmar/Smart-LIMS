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
