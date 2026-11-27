ALTER TABLE payment_transactions
    ADD COLUMN original_payment_id UUID REFERENCES payment_transactions(id),
    ADD COLUMN refund_reason VARCHAR(1000),
    ADD COLUMN refund_confirmation_reference VARCHAR(100) UNIQUE,
    ADD COLUMN refund_occurred_at TIMESTAMPTZ,
    ADD CONSTRAINT payment_transactions_refund_details_check CHECK (
        (original_payment_id IS NULL AND refund_reason IS NULL
            AND refund_confirmation_reference IS NULL AND refund_occurred_at IS NULL)
        OR (type = 'REFUND' AND status = 'CONFIRMED' AND original_payment_id IS NOT NULL
            AND original_payment_id <> id AND recorded_by IS NOT NULL AND confirmed_at IS NOT NULL
            AND refund_reason IS NOT NULL AND length(btrim(refund_reason)) > 0
            AND refund_confirmation_reference IS NOT NULL AND length(btrim(refund_confirmation_reference)) > 0
            AND refund_occurred_at IS NOT NULL AND refund_occurred_at <= recorded_at)
    );

CREATE INDEX payment_transactions_original_payment_idx ON payment_transactions(original_payment_id)
    WHERE original_payment_id IS NOT NULL;
