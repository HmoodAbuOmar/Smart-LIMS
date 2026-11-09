CREATE SEQUENCE visit_number_seq AS BIGINT;
CREATE SEQUENCE specimen_barcode_seq AS BIGINT;

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

CREATE TABLE visits (
 id UUID PRIMARY KEY, visit_number VARCHAR(30) NOT NULL UNIQUE,
 order_id UUID NOT NULL REFERENCES test_orders(id), appointment_id UUID UNIQUE REFERENCES appointments(id),
 status VARCHAR(15) NOT NULL CHECK(status IN ('OPEN','COMPLETED')), version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0),
 arrived_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ,
 created_by UUID NOT NULL REFERENCES users(id), completed_by UUID REFERENCES users(id),
 idempotency_key UUID NOT NULL, request_hash CHAR(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(created_by,idempotency_key), CHECK(completed_at>=arrived_at),
 CHECK((status='COMPLETED' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
 OR (status='OPEN' AND completed_at IS NULL AND completed_by IS NULL))
);
CREATE INDEX visits_order_idx ON visits(order_id,arrived_at DESC,id);
CREATE TABLE visit_items (
 visit_id UUID NOT NULL REFERENCES visits(id), order_item_id UUID NOT NULL REFERENCES order_items(id),
 PRIMARY KEY(visit_id,order_item_id)
);
CREATE INDEX visit_items_item_idx ON visit_items(order_item_id,visit_id);
CREATE TABLE samples (
 id UUID PRIMARY KEY, barcode VARCHAR(30) NOT NULL UNIQUE, visit_id UUID NOT NULL REFERENCES visits(id),
 sample_type VARCHAR(40) NOT NULL CHECK(length(btrim(sample_type))>0), container_type VARCHAR(60), collected_at TIMESTAMPTZ,
 status VARCHAR(15) NOT NULL CHECK(status IN ('REGISTERED','RECEIVED','REJECTED')), version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0),
 received_at TIMESTAMPTZ, received_by UUID REFERENCES users(id), rejected_at TIMESTAMPTZ, rejected_by UUID REFERENCES users(id),
 rejection_reason VARCHAR(1000), replaces_sample_id UUID REFERENCES samples(id),
 created_by UUID NOT NULL REFERENCES users(id), idempotency_key UUID NOT NULL,
 request_hash CHAR(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(created_by,idempotency_key), CHECK(id<>replaces_sample_id), CHECK(received_at>=collected_at),
 CHECK((received_at IS NULL)=(received_by IS NULL)),
 CHECK((status='RECEIVED' AND received_at IS NOT NULL) OR status<>'RECEIVED'),
 CHECK((status='REGISTERED' AND received_at IS NULL) OR status<>'REGISTERED'),
 CHECK((status='REJECTED' AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL AND length(btrim(rejection_reason))>0)
 OR (status<>'REJECTED' AND rejected_at IS NULL AND rejected_by IS NULL AND rejection_reason IS NULL))
);
CREATE INDEX samples_visit_idx ON samples(visit_id);
CREATE INDEX samples_replacement_idx ON samples(replaces_sample_id);
CREATE TABLE specimen_attestations (
 id UUID PRIMARY KEY, sample_id UUID NOT NULL REFERENCES samples(id), order_item_id UUID NOT NULL REFERENCES order_items(id),
 attested_by UUID NOT NULL REFERENCES users(id), attested_at TIMESTAMPTZ NOT NULL,
 UNIQUE(sample_id,order_item_id)
);
CREATE INDEX specimen_attestations_item_idx ON specimen_attestations(order_item_id);

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
CREATE TABLE result_values (
 id UUID PRIMARY KEY, result_id UUID NOT NULL REFERENCES test_results(id), parameter_id UUID NOT NULL REFERENCES test_parameters(id),
 parameter_code_snapshot VARCHAR(30) NOT NULL, parameter_name_snapshot VARCHAR(150) NOT NULL,
 result_type_snapshot VARCHAR(10) NOT NULL CHECK(result_type_snapshot IN ('NUMERIC','TEXT')),
 unit_snapshot VARCHAR(40), method_snapshot VARCHAR(100), display_order_snapshot INTEGER NOT NULL CHECK(display_order_snapshot>=0),
 is_required_snapshot BOOLEAN NOT NULL, numeric_value NUMERIC(38,12), numeric_comparator VARCHAR(2), text_value TEXT,
 reference_text VARCHAR(2000), reference_min NUMERIC(38,12), reference_max NUMERIC(38,12),
 flag VARCHAR(20) NOT NULL DEFAULT 'NOT_EVALUATED' CHECK(flag IN ('NORMAL','HIGH','LOW','ABNORMAL','NOT_EVALUATED')), notes VARCHAR(2000),
 UNIQUE(result_id,parameter_id), CHECK(numeric_value IS NULL OR text_value IS NULL),
 CHECK(numeric_value IS NULL OR result_type_snapshot='NUMERIC'), CHECK(text_value IS NULL OR (result_type_snapshot='TEXT' AND length(btrim(text_value))>0)),
 CHECK(numeric_comparator IS NULL OR (numeric_value IS NOT NULL AND numeric_comparator IN ('<','<=','>','>='))),
 CHECK(reference_min<=reference_max), CHECK(numeric_value<>'NaN'::numeric), CHECK(reference_min<>'NaN'::numeric), CHECK(reference_max<>'NaN'::numeric)
);
CREATE INDEX result_values_parameter_idx ON result_values(parameter_id);
CREATE TABLE result_specimens (
 result_id UUID NOT NULL REFERENCES test_results(id), sample_id UUID NOT NULL REFERENCES samples(id), PRIMARY KEY(result_id,sample_id)
);
CREATE INDEX result_specimens_sample_idx ON result_specimens(sample_id,result_id);
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
CREATE TRIGGER result_values_immutable BEFORE INSERT OR UPDATE OR DELETE ON result_values FOR EACH ROW EXECUTE FUNCTION protect_published_result_child();
CREATE TRIGGER result_specimens_immutable BEFORE INSERT OR UPDATE OR DELETE ON result_specimens FOR EACH ROW EXECUTE FUNCTION protect_published_result_child();
CREATE FUNCTION protect_laboratory_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Laboratory history is append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER laboratory_events_immutable BEFORE UPDATE OR DELETE ON laboratory_events FOR EACH ROW EXECUTE FUNCTION protect_laboratory_event();
