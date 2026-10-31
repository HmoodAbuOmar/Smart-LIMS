package com.smartlims.samples.repository;

import com.smartlims.samples.entity.Sample;

import java.util.*;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface SampleRepository extends JpaRepository<Sample, UUID>, JpaSpecificationExecutor<Sample> {
    Optional<Sample> findByCreatedBy_IdAndIdempotencyKey(UUID actor, UUID key);

    List<Sample> findByVisit_IdOrderByCreatedAtAscIdAsc(UUID visit);

    @Query("select s.visit.order.id from Sample s where s.id=:id")
    Optional<UUID> orderId(@Param("id") UUID id);

    @Query(value = "SELECT nextval('specimen_barcode_seq')", nativeQuery = true)
    long nextBarcode();
}
