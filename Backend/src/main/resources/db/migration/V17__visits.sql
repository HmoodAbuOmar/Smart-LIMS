CREATE SEQUENCE visit_number_seq AS BIGINT;

CREATE TABLE visits (
 id UUID PRIMARY KEY, visit_number VARCHAR(30) NOT NULL UNIQUE,
 order_id UUID NOT NULL REFERENCES test_orders(id), appointment_id UUID UNIQUE REFERENCES appointments(id),
 status VARCHAR(15) NOT NULL CHECK(status IN ('OPEN','COMPLETED')), version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0),
 arrived_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ,
 created_by UUID NOT NULL REFERENCES users(id), completed_by UUID REFERENCES users(id),
 idempotency_key UUID NOT NULL, request_hash CHAR(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(created_by,idempotency_key), CHECK(completed_at>=arrived_at),
 CHECK((status='COMPLETED' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
 OR (status='OPEN' AND completed_at IS NULL AND completed_by IS NULL))
);
CREATE INDEX visits_order_idx ON visits(order_id,arrived_at DESC,id);
