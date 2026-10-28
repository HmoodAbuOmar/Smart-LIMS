package com.smartlims.orders.repository;

import com.smartlims.orders.entity.TestOrder;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.Collection;
import java.util.List;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TestOrderRepository extends JpaRepository<TestOrder, UUID>, JpaSpecificationExecutor<TestOrder> {
    Optional<TestOrder> findByCreatedBy_IdAndIdempotencyKey(UUID createdBy, UUID idempotencyKey);

    Optional<TestOrder> findByIdAndPatient_User_Id(UUID id, UUID userId);

    // Aggregate only the selected page. Item rows never join the outer order/count query.
    @Query("select i.order.id as orderId, count(i) as testCount, sum(i.priceAtOrder) as totalAmount "
            + "from OrderItem i where i.order.id in :ids group by i.order.id")
    List<ItemTotals> findItemTotals(@Param("ids") Collection<UUID> ids);

    interface ItemTotals {
        UUID getOrderId();
        long getTestCount();
        BigDecimal getTotalAmount();
    }

    @Query(value = "SELECT nextval('order_number_seq')", nativeQuery = true)
    long nextOrderNumber();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from TestOrder o where o.id = :id")
    Optional<TestOrder> findForUpdate(@Param("id") UUID id);
}
