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

CREATE TRIGGER result_values_immutable BEFORE INSERT OR UPDATE OR DELETE ON result_values FOR EACH ROW EXECUTE FUNCTION protect_published_result_child();
