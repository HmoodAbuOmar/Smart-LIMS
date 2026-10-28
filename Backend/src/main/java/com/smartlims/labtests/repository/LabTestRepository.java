package com.smartlims.labtests.repository;

import com.smartlims.labtests.entity.LabTest;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface LabTestRepository extends JpaRepository<LabTest, UUID>, JpaSpecificationExecutor<LabTest> {
    boolean existsByCode(String code);
    boolean existsByCodeAndIdNot(String code, UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from LabTest t where t.id = :id")
    Optional<LabTest> findForUpdate(@Param("id") UUID id);

    // Order creation acquires these locks in ascending UUID order before copying snapshots.
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select t from LabTest t where t.id = :id")
    Optional<LabTest> findForSnapshot(@Param("id") UUID id);
}
