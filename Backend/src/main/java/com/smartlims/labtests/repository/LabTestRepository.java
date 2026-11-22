package com.smartlims.labtests.repository;

import com.smartlims.labtests.entity.LabTest;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface LabTestRepository extends JpaRepository<LabTest, UUID>, JpaSpecificationExecutor<LabTest> {
    @Query(value = """
            SELECT EXISTS (SELECT 1 FROM order_items WHERE lab_test_id=:id)
                OR EXISTS (SELECT 1 FROM result_values v JOIN test_parameters p ON p.id=v.parameter_id WHERE p.lab_test_id=:id)
            """, nativeQuery = true)
    boolean hasRetainedUse(@Param("id") UUID id);

    @Modifying
    @Query(value = "DELETE FROM reference_ranges WHERE parameter_id IN (SELECT id FROM test_parameters WHERE lab_test_id=:id)", nativeQuery = true)
    int deleteCatalogRanges(@Param("id") UUID id);

    @Modifying
    @Query(value = "DELETE FROM test_parameters WHERE lab_test_id=:id", nativeQuery = true)
    int deleteCatalogParameters(@Param("id") UUID id);

    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, UUID id);

    @Query("select distinct t.sampleType from LabTest t order by t.sampleType")
    List<String> findSampleTypes();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from LabTest t where t.id = :id")
    Optional<LabTest> findForUpdate(@Param("id") UUID id);

    // Order creation acquires these locks in ascending UUID order before copying snapshots.
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select t from LabTest t where t.id = :id")
    Optional<LabTest> findForSnapshot(@Param("id") UUID id);
}
