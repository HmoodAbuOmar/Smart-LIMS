CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES test_orders(id),
    receipt_number VARCHAR(64) UNIQUE CHECK (length(btrim(receipt_number)) > 0),
    type VARCHAR(10) NOT NULL CHECK (type IN ('PAYMENT', 'REFUND')),
    status VARCHAR(10) NOT NULL CHECK (status IN ('CONFIRMED', 'PENDING', 'FAILED', 'CANCELLED')),
    method VARCHAR(10) CHECK (method IN ('CASH', 'CARD')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ CHECK (
        confirmed_at IS NULL OR (status = 'CONFIRMED' AND confirmed_at >= recorded_at)
    )
);

CREATE INDEX payment_transactions_order_idx ON payment_transactions(order_id);
CREATE INDEX payment_transactions_date_idx
    ON payment_transactions ((COALESCE(confirmed_at, recorded_at)) DESC, id);
