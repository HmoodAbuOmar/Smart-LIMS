package com.smartlims.patients.repository;

import com.smartlims.patients.entity.Patient;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface PatientRepository extends JpaRepository<Patient, UUID>, JpaSpecificationExecutor<Patient> {

    Optional<Patient> findByIdAndUser_Id(UUID id, UUID userId);

    @Query(value = "SELECT nextval('patient_number_seq')", nativeQuery = true)
    long nextPatientNumber();
}
