CREATE TABLE laboratory_events (
 id UUID PRIMARY KEY, result_id UUID REFERENCES test_results(id), sample_id UUID REFERENCES samples(id),
 visit_id UUID REFERENCES visits(id), appointment_id UUID REFERENCES appointments(id),
 kind VARCHAR(40) NOT NULL, actor_id UUID NOT NULL REFERENCES users(id), actor_name_snapshot VARCHAR(120) NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL, recorded_at TIMESTAMPTZ NOT NULL, reason VARCHAR(1000),
 CHECK(num_nonnulls(result_id,sample_id,visit_id,appointment_id)=1)
);
CREATE INDEX laboratory_events_result_idx ON laboratory_events(result_id,recorded_at,id);
CREATE INDEX laboratory_events_sample_idx ON laboratory_events(sample_id,recorded_at,id);
CREATE INDEX laboratory_events_visit_idx ON laboratory_events(visit_id,recorded_at,id);
CREATE INDEX laboratory_events_appointment_idx ON laboratory_events(appointment_id,recorded_at,id);


CREATE FUNCTION protect_laboratory_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Laboratory history is append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER laboratory_events_immutable BEFORE UPDATE OR DELETE ON laboratory_events FOR EACH ROW EXECUTE FUNCTION protect_laboratory_event();
