package com.smartlims.orders.specification;

import com.smartlims.orders.dto.OrderQueryRequest;
import com.smartlims.orders.entity.TestOrder;

import java.util.Locale;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

public final class OrderSpecifications {
    private OrderSpecifications() {
    }

    public static Specification<TestOrder> owned(UUID userId, OrderQueryRequest filter) {
        return (root, query, builder) -> {
            var visible = builder.equal(root.get("patient").get("user").get("id"), userId);
            if (filter.status() != null)
                visible = builder.and(visible, builder.equal(root.get("status"), filter.status()));
            if (!filter.search().isEmpty()) {
                String literal = filter.search().toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                        .replace("%", "\\%").replace("_", "\\_");
                visible = builder.and(visible, builder.like(builder.lower(root.get("orderNumber")), "%" + literal + "%", '\\'));
            }
            return visible;
        };
    }
}
