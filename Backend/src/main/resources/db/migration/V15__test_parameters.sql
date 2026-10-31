CREATE TABLE test_parameters (
 id UUID PRIMARY KEY, lab_test_id UUID NOT NULL REFERENCES lab_tests(id),
 code VARCHAR(30) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
 name VARCHAR(150) NOT NULL CHECK (length(btrim(name))>0),
 result_type VARCHAR(10) NOT NULL CHECK (result_type IN ('NUMERIC','TEXT')),
 unit VARCHAR(40), method VARCHAR(100), display_order INTEGER NOT NULL CHECK (display_order>=0),
 is_required BOOLEAN NOT NULL, active BOOLEAN NOT NULL, version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(lab_test_id,code)
);
