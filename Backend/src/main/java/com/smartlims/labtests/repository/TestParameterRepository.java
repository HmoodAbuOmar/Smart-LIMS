package com.smartlims.labtests.repository;

import com.smartlims.labtests.entity.TestParameter;

import java.util.*;

import org.springframework.data.jpa.repository.*;

public interface TestParameterRepository extends JpaRepository<TestParameter, UUID>, JpaSpecificationExecutor<TestParameter> {
    boolean existsByLabTest_IdAndCodeAndIdNot(UUID test, String code, UUID id);

    List<TestParameter> findByLabTest_IdAndActiveTrueOrderByDisplayOrderAscCodeAscIdAsc(UUID test);

    Optional<TestParameter> findByIdAndLabTest_Id(UUID id, UUID test);
}
