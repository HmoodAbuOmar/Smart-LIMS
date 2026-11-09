CREATE TABLE lab_tests (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'ILS',
    sample_type VARCHAR(40) NOT NULL,
    preparation_instructions TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lab_tests_code_key UNIQUE (code),
    CONSTRAINT lab_tests_code_check CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
    CONSTRAINT lab_tests_name_check CHECK (length(btrim(name)) > 0),
    CONSTRAINT lab_tests_sample_type_check CHECK (length(btrim(sample_type)) > 0),
    CONSTRAINT lab_tests_price_check CHECK (price >= 0 AND price <> 'NaN'::numeric),
    CONSTRAINT lab_tests_currency_check CHECK (currency = 'ILS')
);

CREATE INDEX lab_tests_active_name_id_idx ON lab_tests(active, name, id);
CREATE INDEX lab_tests_created_at_id_idx ON lab_tests(created_at DESC, id ASC);
