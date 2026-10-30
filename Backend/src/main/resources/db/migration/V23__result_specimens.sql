CREATE TABLE result_specimens (
 result_id UUID NOT NULL REFERENCES test_results(id), sample_id UUID NOT NULL REFERENCES samples(id), PRIMARY KEY(result_id,sample_id)
);
CREATE INDEX result_specimens_sample_idx ON result_specimens(sample_id,result_id);

CREATE TRIGGER result_specimens_immutable BEFORE INSERT OR UPDATE OR DELETE ON result_specimens FOR EACH ROW EXECUTE FUNCTION protect_published_result_child();
