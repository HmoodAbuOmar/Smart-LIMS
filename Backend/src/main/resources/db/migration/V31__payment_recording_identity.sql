ALTER TABLE payment_transactions
    ADD COLUMN recorded_by UUID REFERENCES users(id),
    ADD COLUMN idempotency_key UUID,
    ADD CONSTRAINT payment_transactions_recording_identity_check
        CHECK ((recorded_by IS NULL) = (idempotency_key IS NULL)),
    ADD CONSTRAINT payment_transactions_recording_key UNIQUE (recorded_by, idempotency_key);
