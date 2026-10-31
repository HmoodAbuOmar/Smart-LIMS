package com.smartlims.orders.repository;

import com.smartlims.orders.entity.OrderItem;

import java.util.*;

import org.springframework.data.jpa.repository.*;

public interface OrderItemRepository extends JpaRepository<OrderItem, UUID>, JpaSpecificationExecutor<OrderItem> {
    List<OrderItem> findByOrder_Id(UUID order);
}
