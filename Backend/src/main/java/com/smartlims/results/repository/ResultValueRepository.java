package com.smartlims.results.repository;

import com.smartlims.results.entity.ResultValue;

import java.util.*;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ResultValueRepository extends JpaRepository<ResultValue, UUID> {
    boolean existsByParameter_Id(UUID parameter);

    @Query("select v from ResultValue v join fetch v.result r join fetch r.item i join fetch i.order o where o.patient.user.id=:user and r.current=true and r.status=com.smartlims.results.entity.ResultStatus.PUBLISHED and v.type=com.smartlims.labtests.entity.TestParameter.ValueType.NUMERIC and v.numericValue is not null")
    List<ResultValue> currentNumericForPatient(@Param("user") UUID user);
}
