CREATE TABLE appointment_reschedules (
    id UUID PRIMARY KEY,
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE NO ACTION,
    old_slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE NO ACTION,
    new_slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE NO ACTION,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
    from_version BIGINT NOT NULL CHECK (from_version >= 0),
    changed_at TIMESTAMPTZ NOT NULL,
    UNIQUE(appointment_id,from_version),
    CHECK (old_slot_id <> new_slot_id)
);
CREATE INDEX appointment_reschedules_actor_idx ON appointment_reschedules(changed_by);
CREATE INDEX appointment_reschedules_old_slot_idx ON appointment_reschedules(old_slot_id);
CREATE INDEX appointment_reschedules_new_slot_idx ON appointment_reschedules(new_slot_id);
