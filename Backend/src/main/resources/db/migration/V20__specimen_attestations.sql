CREATE TABLE specimen_attestations (
 id UUID PRIMARY KEY, sample_id UUID NOT NULL REFERENCES samples(id), order_item_id UUID NOT NULL REFERENCES order_items(id),
 attested_by UUID NOT NULL REFERENCES users(id), attested_at TIMESTAMPTZ NOT NULL,
 UNIQUE(sample_id,order_item_id)
);
CREATE INDEX specimen_attestations_item_idx ON specimen_attestations(order_item_id);
