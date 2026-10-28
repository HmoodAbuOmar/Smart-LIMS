package com.smartlims.orders.repository;

import com.smartlims.orders.entity.TestOrder;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TestOrderRepository extends JpaRepository<TestOrder, UUID> {
    Optional<TestOrder> findByCreatedBy_IdAndIdempotencyKey(UUID createdBy, UUID idempotencyKey);

    @Query(value = "SELECT nextval('order_number_seq')", nativeQuery = true)
    long nextOrderNumber();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from TestOrder o where o.id = :id")
    Optional<TestOrder> findForUpdate(@Param("id") UUID id);
}
