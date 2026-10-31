CREATE TABLE patient_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    order_id UUID NOT NULL REFERENCES test_orders(id),
    appointment_id UUID REFERENCES appointments(id),
    result_id UUID REFERENCES test_results(id),
    category VARCHAR(20) NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    event_key VARCHAR(180) NOT NULL UNIQUE,
    title VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
    message VARCHAR(1000) NOT NULL CHECK (length(btrim(message)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    read_at TIMESTAMPTZ,
    CONSTRAINT patient_notifications_read_time CHECK (read_at IS NULL OR read_at >= created_at),
    CONSTRAINT patient_notifications_event_shape CHECK (
        (category = 'ORDERS' AND event_type IN ('ORDER_CREATED','ORDER_CANCELLED','ORDER_IN_PROGRESS','ORDER_COMPLETED')
            AND appointment_id IS NULL AND result_id IS NULL)
        OR (category = 'APPOINTMENTS' AND event_type IN ('APPOINTMENT_CONFIRMED','APPOINTMENT_RESCHEDULED',
            'APPOINTMENT_CANCELLED','APPOINTMENT_CHECKED_IN','APPOINTMENT_COMPLETED','APPOINTMENT_NO_SHOW')
            AND appointment_id IS NOT NULL AND result_id IS NULL)
        OR (category = 'RESULTS' AND event_type IN ('RESULT_PUBLISHED','RESULT_CORRECTED')
            AND result_id IS NOT NULL AND appointment_id IS NULL)
    )
);

CREATE INDEX patient_notifications_patient_time_idx ON patient_notifications(patient_id, created_at DESC, id);
CREATE INDEX patient_notifications_patient_unread_idx ON patient_notifications(patient_id, created_at DESC, id) WHERE read_at IS NULL;
CREATE INDEX patient_notifications_order_idx ON patient_notifications(order_id);
CREATE INDEX patient_notifications_appointment_idx ON patient_notifications(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX patient_notifications_result_idx ON patient_notifications(result_id) WHERE result_id IS NOT NULL;
