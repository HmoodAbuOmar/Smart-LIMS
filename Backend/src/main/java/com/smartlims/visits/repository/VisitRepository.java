package com.smartlims.visits.repository;

import com.smartlims.visits.entity.Visit;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface VisitRepository extends JpaRepository<Visit,UUID>,JpaSpecificationExecutor<Visit>{
    Optional<Visit> findByCreatedBy_IdAndIdempotencyKey(UUID actor,UUID key);
    boolean existsByAppointment_Id(UUID appointment);
    boolean existsByOrder_Id(UUID order);
    boolean existsByOrder_IdAndStatus(UUID order,Visit.Status status);
    List<Visit> findByOrder_IdOrderByArrivedAtDescIdAsc(UUID order);
    @Query("select v.order.id from Visit v where v.id=:id") Optional<UUID> orderId(@Param("id") UUID id);
    @Query("select count(v)>0 from Visit v join v.itemIds i where i=:item") boolean hasItem(@Param("item") UUID item);
    @Query("select v from Visit v join v.itemIds i where i=:item order by v.arrivedAt desc,v.id asc") List<Visit> forItem(@Param("item") UUID item);
    @Query(value="SELECT nextval('visit_number_seq')",nativeQuery=true) long nextNumber();
}
