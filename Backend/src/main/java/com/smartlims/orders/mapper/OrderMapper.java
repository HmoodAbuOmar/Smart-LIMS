package com.smartlims.orders.mapper;

import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.orders.dto.OrderItemResponse;
import com.smartlims.orders.dto.OrderSummaryResponse;
import com.smartlims.orders.entity.OrderItem;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.entity.TestOrder;
import java.math.BigDecimal;
import java.util.Comparator;
import org.springframework.stereotype.Component;

@Component
public class OrderMapper {
    private final com.smartlims.visits.repository.VisitRepository visits;
    public OrderMapper(com.smartlims.visits.repository.VisitRepository visits){this.visits=visits;}
    public OrderSummaryResponse toSummary(TestOrder order, long testCount, BigDecimal totalAmount) {
        return new OrderSummaryResponse(order.getId(), order.getOrderNumber(), order.getCreatedAt(), order.getUpdatedAt(),
                Math.toIntExact(testCount), totalAmount.setScale(2), order.getCurrency(), order.getStatus(),
                order.getStatus() == OrderStatus.PENDING, visits.existsByOrder_Id(order.getId()));
    }

    // Called within an authorized transaction; snapshots are the only historical display source.
    public OrderDetailResponse toDetail(TestOrder order) {
        var items = order.getItems().stream()
                .sorted(Comparator.comparing(OrderItem::getTestCodeSnapshot)
                        .thenComparing(item -> item.getId().toString()))
                .map(item -> new OrderItemResponse(item.getId(), item.getLabTest().getId(),
                        item.getTestCodeSnapshot(), item.getTestNameSnapshot(), item.getPriceAtOrder().setScale(2)))
                .toList();
        BigDecimal total = items.stream().map(OrderItemResponse::priceAtOrder).reduce(new BigDecimal("0.00"), BigDecimal::add);
        return new OrderDetailResponse(order.getId(), order.getOrderNumber(), order.getCreatedAt(), order.getUpdatedAt(),
                items.size(), total, order.getCurrency(), order.getStatus(), order.getStatus() == OrderStatus.PENDING,
                visits.existsByOrder_Id(order.getId()), order.getPatient().getId(), items, order.getCancelledAt(), order.getCancellationReason());
    }
}
