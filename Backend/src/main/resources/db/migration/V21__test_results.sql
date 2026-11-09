CREATE TABLE test_results (
 id UUID PRIMARY KEY, order_item_id UUID NOT NULL REFERENCES order_items(id),
 status VARCHAR(15) NOT NULL CHECK(status IN ('DRAFT','APPROVED','PUBLISHED')),
 version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0), version_number INTEGER NOT NULL CHECK(version_number>0),
 previous_result_id UUID UNIQUE REFERENCES test_results(id), is_current BOOLEAN NOT NULL DEFAULT FALSE,
 entered_by UUID NOT NULL REFERENCES users(id), measured_at TIMESTAMPTZ,
 approved_by UUID REFERENCES users(id), approved_at TIMESTAMPTZ, approver_name_snapshot VARCHAR(120),
 published_by UUID REFERENCES users(id), published_at TIMESTAMPTZ, publisher_name_snapshot VARCHAR(120),
 correction_reason VARCHAR(1000), patient_name_snapshot VARCHAR(120), patient_number_snapshot VARCHAR(30),
 birth_date_snapshot DATE, explanation TEXT, specimen_snapshots TEXT NOT NULL DEFAULT '[]',
 idempotency_key UUID NOT NULL, request_hash CHAR(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(order_item_id,version_number), UNIQUE(entered_by,idempotency_key),
 CHECK(NOT is_current OR status='PUBLISHED'), CHECK(jsonb_typeof(specimen_snapshots::jsonb)='array'),
 CHECK((previous_result_id IS NULL AND correction_reason IS NULL) OR (previous_result_id IS NOT NULL AND correction_reason IS NOT NULL AND length(btrim(correction_reason))>0)),
 CHECK((status='DRAFT' AND approved_by IS NULL AND approved_at IS NULL AND approver_name_snapshot IS NULL)
 OR (status IN ('APPROVED','PUBLISHED') AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approver_name_snapshot IS NOT NULL
 AND measured_at IS NOT NULL AND patient_name_snapshot IS NOT NULL AND patient_number_snapshot IS NOT NULL AND birth_date_snapshot IS NOT NULL AND jsonb_array_length(specimen_snapshots::jsonb)>0)),
 CHECK((status='PUBLISHED' AND published_by IS NOT NULL AND published_at IS NOT NULL AND publisher_name_snapshot IS NOT NULL)
 OR (status<>'PUBLISHED' AND published_by IS NULL AND published_at IS NULL AND publisher_name_snapshot IS NULL)),
 CHECK(approved_by<>entered_by), CHECK(published_at>=approved_at)
);
CREATE UNIQUE INDEX test_results_current_idx ON test_results(order_item_id) WHERE is_current;
CREATE UNIQUE INDEX test_results_working_idx ON test_results(order_item_id) WHERE status IN ('DRAFT','APPROVED');

CREATE FUNCTION protect_published_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published result is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='PUBLISHED' THEN
  IF (to_jsonb(NEW)-ARRAY['is_current','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['is_current','version','updated_at'])
   OR (NEW.is_current AND NOT OLD.is_current) THEN RAISE EXCEPTION 'Published result is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER test_results_immutable BEFORE UPDATE OR DELETE ON test_results FOR EACH ROW EXECUTE FUNCTION protect_published_result();
CREATE FUNCTION protect_published_result_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent UUID;
BEGIN
 IF TG_OP='DELETE' THEN parent=OLD.result_id; ELSE parent=NEW.result_id; END IF;
 IF EXISTS(SELECT 1 FROM test_results WHERE id=parent AND status='PUBLISHED') THEN RAISE EXCEPTION 'Published result content is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.result_id<>NEW.result_id AND EXISTS(SELECT 1 FROM test_results WHERE id=OLD.result_id AND status='PUBLISHED') THEN RAISE EXCEPTION 'Published result content is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
