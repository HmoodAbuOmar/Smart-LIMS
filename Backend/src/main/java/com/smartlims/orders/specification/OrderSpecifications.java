package com.smartlims.orders.specification;

import com.smartlims.appointments.entity.Appointment;
import com.smartlims.appointments.entity.AppointmentStatus;
import com.smartlims.orders.dto.OrderQueryRequest;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.entity.TestOrder;

import java.util.Locale;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

public final class OrderSpecifications {
    private OrderSpecifications() {
    }

    public static Specification<TestOrder> bookable() {
        return (root, query, builder) -> {
            var active = query.subquery(Integer.class);
            var appointment = active.from(Appointment.class);
            active.select(builder.literal(1)).where(builder.equal(appointment.get("order"), root),
                    appointment.get("status").in(AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN));
            return builder.and(builder.equal(root.get("status"), OrderStatus.PENDING),
                    builder.isNotEmpty(root.get("items")), builder.not(builder.exists(active)));
        };
    }

    public static Specification<TestOrder> receptionistSearch(String search) {
        if (search.isEmpty())
            return Specification.unrestricted();
        String pattern = containsLiteral(search);
        return (root, query, builder) -> {
            var patient = root.join("patient");
            return builder.or(builder.like(builder.lower(root.get("orderNumber")), pattern, '\\'),
                    builder.like(builder.lower(patient.get("fullName")), pattern, '\\'),
                    builder.like(builder.lower(patient.get("patientNumber")), pattern, '\\'));
        };
    }

    private static String containsLiteral(String search) {
        return "%" + search.toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                .replace("%", "\\%").replace("_", "\\_") + "%";
    }

    public static Specification<TestOrder> owned(UUID userId, OrderQueryRequest filter) {
        return (root, query, builder) -> {
            var visible = builder.equal(root.get("patient").get("user").get("id"), userId);
            if (filter.status() != null)
                visible = builder.and(visible, builder.equal(root.get("status"), filter.status()));
            if (!filter.search().isEmpty()) {
                visible = builder.and(visible, builder.like(builder.lower(root.get("orderNumber")),
                        containsLiteral(filter.search()), '\\'));
            }
            return visible;
        };
    }
}
