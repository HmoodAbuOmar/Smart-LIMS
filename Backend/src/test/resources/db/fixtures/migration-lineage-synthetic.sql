-- Synthetic migration rehearsal only; never load into an application database.
INSERT INTO users(id,full_name,email,role,origin,enabled) VALUES
('00000000-0000-0000-0000-000000000001','Synthetic reviewer','reviewer@example.invalid','ADMIN','ADMIN_INVITATION',true),
('00000000-0000-0000-0000-000000000002','Synthetic author','author@example.invalid','LAB_TECHNICIAN','ADMIN_INVITATION',true),
('00000000-0000-0000-0000-000000000003','Synthetic patient','patient@example.invalid','PATIENT','PUBLIC_REGISTRATION',true);
INSERT INTO email_action_tokens(id,user_id,purpose,token_hash,expires_at) VALUES ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000003','VERIFY_EMAIL',repeat('c',64),'2030-01-02Z');
INSERT INTO patients(id,patient_number,user_id,full_name,date_of_birth,gender,phone_number,created_by) VALUES
('00000000-0000-0000-0000-000000000004','PAT-SYNTHETIC','00000000-0000-0000-0000-000000000003','Synthetic patient','2000-01-01','UNKNOWN','000001','00000000-0000-0000-0000-000000000001');
INSERT INTO patient_link_tokens(id,token_hash,patient_id,issued_by,expires_at,consumed_at) VALUES ('00000000-0000-0000-0000-000000000024',repeat('d',64),'00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','2030-01-02Z','2030-01-01Z');
INSERT INTO lab_tests(id,code,name,price,sample_type) VALUES ('00000000-0000-0000-0000-000000000005','SYNTH','Synthetic panel',1.25,'SYNTHETIC');
INSERT INTO lab_test_categories VALUES ('00000000-0000-0000-0000-000000000005','THYROID');
INSERT INTO test_orders(id,order_number,patient_id,created_by,idempotency_key,request_hash,status) VALUES
('00000000-0000-0000-0000-000000000007','ORD-000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000030',repeat('a',64),'COMPLETED');
INSERT INTO order_items(id,order_id,lab_test_id,test_code_snapshot,test_name_snapshot,price_at_order) VALUES
('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000005','SYNTH','Synthetic ordered panel',1.25);
INSERT INTO appointment_types(id,code,name) VALUES ('00000000-0000-0000-0000-000000000011','SYNTH','Synthetic type');
INSERT INTO appointment_slots(id,starts_at,ends_at,capacity) VALUES
('00000000-0000-0000-0000-000000000009','2030-01-01T10:00Z','2030-01-01T11:00Z',2),('00000000-0000-0000-0000-000000000010','2030-01-01T11:00Z','2030-01-01T12:00Z',2);
INSERT INTO appointments(id,order_id,slot_id,original_slot_id,type_id,type_name_snapshot,created_by,idempotency_key,version,status,checked_in_at,checked_in_by,completed_at,completed_by) VALUES
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000011','Synthetic booked type','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000031',1,'COMPLETED','2030-01-01T11:00Z','00000000-0000-0000-0000-000000000001','2030-01-01T12:00Z','00000000-0000-0000-0000-000000000001');
INSERT INTO appointment_reschedules(id,appointment_id,old_slot_id,new_slot_id,changed_by,from_version,changed_at) VALUES ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001',0,'2030-01-01T09:00Z');
INSERT INTO test_parameters(id,lab_test_id,code,name,result_type,unit,display_order,is_required,active) VALUES
('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000005','SYNTH','Synthetic number','NUMERIC','synthetic-unit',0,true,true);
INSERT INTO visits(id,visit_number,order_id,appointment_id,status,arrived_at,completed_at,created_by,completed_by,idempotency_key,request_hash) VALUES
('00000000-0000-0000-0000-000000000014','VIS-SYNTHETIC','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000012','COMPLETED','2030-01-01T11:00Z','2030-01-01T12:00Z','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000032',repeat('a',64));
INSERT INTO visit_items VALUES ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000008');
INSERT INTO samples(id,barcode,visit_id,sample_type,status,rejected_at,rejected_by,rejection_reason,created_by,idempotency_key,request_hash) VALUES
('00000000-0000-0000-0000-000000000015','SPC-SYNTHETIC-OLD','00000000-0000-0000-0000-000000000014','SYNTHETIC','REJECTED','2030-01-01T11:05Z','00000000-0000-0000-0000-000000000002','Synthetic rejection','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000033',repeat('a',64));
INSERT INTO samples(id,barcode,visit_id,sample_type,status,received_at,received_by,replaces_sample_id,created_by,idempotency_key,request_hash) VALUES
('00000000-0000-0000-0000-000000000016','SPC-SYNTHETIC-NEW','00000000-0000-0000-0000-000000000014','SYNTHETIC','RECEIVED','2030-01-01T11:10Z','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000034',repeat('a',64));
INSERT INTO specimen_attestations(id,sample_id,order_item_id,attested_by,attested_at) VALUES ('00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000002','2030-01-01T11:11Z');
INSERT INTO test_results(id,order_item_id,status,version_number,entered_by,idempotency_key,request_hash) VALUES ('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000008','DRAFT',1,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000035',repeat('a',64));
INSERT INTO result_values(id,result_id,parameter_id,parameter_code_snapshot,parameter_name_snapshot,result_type_snapshot,display_order_snapshot,is_required_snapshot,numeric_value) VALUES
('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000006','SYNTH','Synthetic number','NUMERIC',0,true,1.123456789012);
INSERT INTO result_specimens VALUES ('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000016');
UPDATE test_results SET status='PUBLISHED',is_current=true,measured_at='2030-01-01T11:15Z',approved_by='00000000-0000-0000-0000-000000000001',approved_at='2030-01-01T11:20Z',approver_name_snapshot='Synthetic reviewer',published_by='00000000-0000-0000-0000-000000000001',published_at='2030-01-01T11:21Z',publisher_name_snapshot='Synthetic reviewer',patient_name_snapshot='Synthetic patient',patient_number_snapshot='PAT-SYNTHETIC',birth_date_snapshot='2000-01-01',specimen_snapshots='[{"sampleType":"SYNTHETIC"}]' WHERE id='00000000-0000-0000-0000-000000000018';
INSERT INTO test_results(id,order_item_id,status,version_number,previous_result_id,correction_reason,entered_by,idempotency_key,request_hash) VALUES ('00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-000000000008','DRAFT',2,'00000000-0000-0000-0000-000000000018','Synthetic correction','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000036',repeat('b',64));
INSERT INTO result_values(id,result_id,parameter_id,parameter_code_snapshot,parameter_name_snapshot,result_type_snapshot,display_order_snapshot,is_required_snapshot,numeric_value) VALUES
('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-000000000006','SYNTH','Synthetic number','NUMERIC',0,true,2.123456789012);
INSERT INTO result_specimens VALUES ('00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-000000000016');
UPDATE test_results SET is_current=false,version=1 WHERE id='00000000-0000-0000-0000-000000000018';
UPDATE test_results SET status='PUBLISHED',is_current=true,measured_at='2030-01-01T11:15Z',approved_by='00000000-0000-0000-0000-000000000001',approved_at='2030-01-01T11:25Z',approver_name_snapshot='Synthetic reviewer',published_by='00000000-0000-0000-0000-000000000001',published_at='2030-01-01T11:26Z',publisher_name_snapshot='Synthetic reviewer',patient_name_snapshot='Synthetic patient',patient_number_snapshot='PAT-SYNTHETIC',birth_date_snapshot='2000-01-01',specimen_snapshots='[{"sampleType":"SYNTHETIC"}]' WHERE id='00000000-0000-0000-0000-000000000019';
INSERT INTO laboratory_events(id,result_id,kind,actor_id,actor_name_snapshot,occurred_at,recorded_at,reason) VALUES
('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000019','RESULT_PUBLISHED','00000000-0000-0000-0000-000000000001','Synthetic reviewer','2030-01-01T11:26Z','2030-01-01T11:26Z','Synthetic correction publication');
SELECT setval('patient_number_seq',101,true);
SELECT setval('order_number_seq',202,false);
SELECT setval('visit_number_seq',303,true);
SELECT setval('specimen_barcode_seq',404,false);
