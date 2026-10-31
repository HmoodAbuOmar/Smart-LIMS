CREATE TABLE lab_test_categories (
    lab_test_id UUID NOT NULL,
    category VARCHAR(30) NOT NULL,
    CONSTRAINT lab_test_categories_pkey PRIMARY KEY (lab_test_id, category),
    CONSTRAINT lab_test_categories_lab_test_id_fkey
        FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id) ON DELETE NO ACTION,
    CONSTRAINT lab_test_categories_category_check CHECK (category IN (
        'BLOOD_TESTS', 'VITAMINS_MINERALS', 'THYROID', 'LIVER', 'KIDNEY', 'LIPIDS', 'DIABETES'
    ))
);

CREATE INDEX lab_test_categories_category_lab_test_id_idx
    ON lab_test_categories(category, lab_test_id);
