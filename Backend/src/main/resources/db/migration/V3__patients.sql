CREATE SEQUENCE patient_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE patients (
    id UUID PRIMARY KEY,
    patient_number VARCHAR(30) NOT NULL UNIQUE,
    user_id UUID UNIQUE REFERENCES users(id),
    full_name VARCHAR(120) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    address TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT patients_gender_check CHECK (gender IN ('MALE', 'FEMALE', 'UNKNOWN')),
    CONSTRAINT patients_full_name_check CHECK (length(btrim(full_name)) > 0),
    CONSTRAINT patients_phone_number_check CHECK (length(btrim(phone_number)) > 0)
);

CREATE INDEX patients_created_by_idx ON patients(created_by);
CREATE INDEX patients_created_at_id_idx ON patients(created_at DESC, id ASC);
