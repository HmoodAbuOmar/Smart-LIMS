CREATE SEQUENCE specimen_barcode_seq AS BIGINT;

CREATE TABLE samples (
 id UUID PRIMARY KEY, barcode VARCHAR(30) NOT NULL UNIQUE, visit_id UUID NOT NULL REFERENCES visits(id),
 sample_type VARCHAR(40) NOT NULL CHECK(length(btrim(sample_type))>0), container_type VARCHAR(60), collected_at TIMESTAMPTZ,
 status VARCHAR(15) NOT NULL CHECK(status IN ('REGISTERED','RECEIVED','REJECTED')), version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0),
 received_at TIMESTAMPTZ, received_by UUID REFERENCES users(id), rejected_at TIMESTAMPTZ, rejected_by UUID REFERENCES users(id),
 rejection_reason VARCHAR(1000), replaces_sample_id UUID REFERENCES samples(id),
 created_by UUID NOT NULL REFERENCES users(id), idempotency_key UUID NOT NULL,
 request_hash CHAR(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(created_by,idempotency_key), CHECK(id<>replaces_sample_id), CHECK(received_at>=collected_at),
 CHECK((received_at IS NULL)=(received_by IS NULL)),
 CHECK((status='RECEIVED' AND received_at IS NOT NULL) OR status<>'RECEIVED'),
 CHECK((status='REGISTERED' AND received_at IS NULL) OR status<>'REGISTERED'),
 CHECK((status='REJECTED' AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL AND length(btrim(rejection_reason))>0)
 OR (status<>'REJECTED' AND rejected_at IS NULL AND rejected_by IS NULL AND rejection_reason IS NULL))
);
CREATE INDEX samples_visit_idx ON samples(visit_id);
CREATE INDEX samples_replacement_idx ON samples(replaces_sample_id);
