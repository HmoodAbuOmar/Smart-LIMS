-- Expand V8 through a new migration, preserving every existing appointment.
ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK(status IN ('CONFIRMED','CANCELLED','CHECKED_IN','COMPLETED','NO_SHOW'));
ALTER TABLE appointments DROP CONSTRAINT appointments_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_cancellation_state_check CHECK (
 (status='CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
 OR (status<>'CANCELLED' AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL));
ALTER TABLE appointments ADD COLUMN checked_in_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN checked_in_by UUID REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN completed_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN completed_by UUID REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN no_show_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN no_show_by UUID REFERENCES users(id);
ALTER TABLE appointments ADD CONSTRAINT appointments_visit_state_check CHECK (
 (checked_in_at IS NULL)=(checked_in_by IS NULL)
 AND (completed_at IS NULL)=(completed_by IS NULL)
 AND (no_show_at IS NULL)=(no_show_by IS NULL)
 AND
 ((status IN ('CHECKED_IN','COMPLETED')) = (checked_in_at IS NOT NULL AND checked_in_by IS NOT NULL))
 AND ((status='COMPLETED') = (completed_at IS NOT NULL AND completed_by IS NOT NULL))
 AND ((status='NO_SHOW') = (no_show_at IS NOT NULL AND no_show_by IS NOT NULL)));
DROP INDEX appointments_active_order_idx;
CREATE UNIQUE INDEX appointments_active_order_idx ON appointments(order_id) WHERE status IN ('CONFIRMED','CHECKED_IN');
