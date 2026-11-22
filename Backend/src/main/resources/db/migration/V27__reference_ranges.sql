CREATE TABLE reference_ranges (
 id UUID PRIMARY KEY,
 parameter_id UUID NOT NULL REFERENCES test_parameters(id),
 applicability VARCHAR(6) NOT NULL CHECK (applicability IN ('MALE','FEMALE','ANY')),
 min_age_days INTEGER CHECK (min_age_days>=0),
 max_age_days INTEGER CHECK (max_age_days>=0),
 lower_limit NUMERIC(38,12), upper_limit NUMERIC(38,12),
 valid_from DATE, valid_to DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (min_age_days<max_age_days),
 CHECK (valid_from<valid_to),
 CHECK (valid_from IS NULL OR valid_from BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 CHECK (valid_to IS NULL OR valid_to BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
 CHECK (lower_limit IS NOT NULL OR upper_limit IS NOT NULL),
 CHECK (lower_limit<=upper_limit),
 CHECK (lower_limit NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 CHECK (upper_limit NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
);
CREATE INDEX reference_ranges_applicability_idx ON reference_ranges(parameter_id,applicability);
CREATE INDEX reference_ranges_page_idx ON reference_ranges(parameter_id,created_at,id);
