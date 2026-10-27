package com.smartlims.patients.repository;

import com.smartlims.patients.entity.PatientLinkToken;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PatientLinkTokenRepository extends JpaRepository<PatientLinkToken, UUID> {
    // Resolve only the profile ID before acquiring locks in account -> profile -> token order.
    @Query("select t.patient.id from PatientLinkToken t where t.tokenHash = :hash")
    Optional<UUID> findPatientIdByTokenHash(@Param("hash") String hash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from PatientLinkToken t where t.tokenHash = :hash")
    Optional<PatientLinkToken> findWithLockByTokenHash(@Param("hash") String hash);

    @Modifying
    @Query("update PatientLinkToken t set t.revokedAt = :now where t.patient.id = :patientId "
            + "and t.consumedAt is null and t.revokedAt is null")
    int revokeOutstanding(@Param("patientId") UUID patientId, @Param("now") Instant now);
}
