CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL,
    actor_name_snapshot VARCHAR(120) NOT NULL,
    action VARCHAR(40) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    summary VARCHAR(250) NOT NULL,
    CHECK (length(btrim(actor_name_snapshot)) > 0),
    CHECK (length(btrim(action)) > 0 AND length(btrim(entity_type)) > 0),
    CHECK (length(btrim(summary)) > 0)
);
CREATE INDEX audit_logs_recorded_idx ON audit_logs(recorded_at DESC,id DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id,recorded_at DESC,id DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs(action,recorded_at DESC,id DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type,entity_id,recorded_at DESC,id DESC);
CREATE FUNCTION protect_admin_audit_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Administrative audit history is append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION protect_admin_audit_log();
