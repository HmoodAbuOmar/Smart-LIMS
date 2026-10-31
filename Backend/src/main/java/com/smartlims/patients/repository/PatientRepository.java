package com.smartlims.patients.repository;

import com.smartlims.patients.entity.Patient;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.query.Param;

public interface PatientRepository extends JpaRepository<Patient, UUID>, JpaSpecificationExecutor<Patient> {

    Optional<Patient> findByIdAndUser_Id(UUID id, UUID userId);

    Optional<Patient> findByUser_Id(UUID userId);

    boolean existsByUser_Id(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Patient p where p.user.id = :userId")
    Optional<Patient> findWithLockByUserId(@Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Patient p where p.id = :id")
    Optional<Patient> findWithLockById(@Param("id") UUID id);

    @Query(value = "SELECT nextval('patient_number_seq')", nativeQuery = true)
    long nextPatientNumber();
}
