-- All appointments are laboratory visits. Preserve bookings and their slot/history references.
ALTER TABLE appointments DROP CONSTRAINT appointments_type_id_fkey;
ALTER TABLE appointments DROP COLUMN type_id;
ALTER TABLE appointments DROP COLUMN type_name_snapshot;
DROP TABLE appointment_types;
