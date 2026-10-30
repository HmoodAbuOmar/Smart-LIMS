package com.smartlims.results.repository;

import com.smartlims.results.entity.*;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface TestResultRepository extends JpaRepository<TestResult,UUID>,JpaSpecificationExecutor<TestResult>{
    @Query("select coalesce(max(r.versionNumber),0) from TestResult r where r.item.id=:item") int lastNumber(@Param("item") UUID item);
    Optional<TestResult> findByEnteredBy_IdAndIdempotencyKey(UUID actor,UUID key);
    Optional<TestResult> findByItem_IdAndCurrentTrue(UUID item);
    boolean existsByItem_IdAndStatusIn(UUID item,Collection<ResultStatus> states);
    List<TestResult> findByItem_IdOrderByVersionNumberDesc(UUID item);
    @Query("select r.item.order.id from TestResult r where r.id=:id") Optional<UUID> orderId(@Param("id") UUID id);
    @Query("select count(r)>0 from TestResult r join r.specimenIds s where s=:sample and r.status in (com.smartlims.results.entity.ResultStatus.APPROVED,com.smartlims.results.entity.ResultStatus.PUBLISHED)") boolean protectsSample(@Param("sample") UUID sample);
}
