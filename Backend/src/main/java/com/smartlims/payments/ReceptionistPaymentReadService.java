package com.smartlims.payments;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.HistoryDates;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.orders.service.OrderAccess;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.exception.OrderException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ReceptionistPaymentReadService {
    private final OrderAccess access;
    private final PaymentReadRepository payments;
    private final TestOrderRepository orders;

    public ReceptionistPaymentReadService(OrderAccess access, PaymentReadRepository payments, TestOrderRepository orders) {
        this.access = access;
        this.payments = payments;
        this.orders = orders;
    }

    public ReceptionistPaymentResponses.Page list(Authentication actor, LaboratoryQuery query) {
        access.current(actor, Role.RECEPTIONIST);
        var dates = HistoryDates.archive(query);
        var search = HistoryDates.search(query);
        var type = choice(query, "type", Set.of("PAYMENT", "REFUND"));
        var status = choice(query, "status", Set.of("CONFIRMED", "PENDING", "FAILED", "CANCELLED"));
        var orderId = query.optionalId("orderId");
        var filter = new StringBuilder(" WHERE true");
        var parameters = new HashMap<String, Object>();
        if (!search.isEmpty()) {
            filter.append(" AND (lower(o.order_number) LIKE :search OR lower(p.full_name) LIKE :search"
                    + " OR lower(p.patient_number) LIKE :search)");
            parameters.put("search", "%" + search.toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (dates.start() != null) {
            filter.append(" AND ").append(PaymentReadRepository.TRANSACTION_DATE).append(" >= :start");
            parameters.put("start", OffsetDateTime.ofInstant(dates.start(), ZoneOffset.UTC));
        }
        if (dates.end() != null) {
            filter.append(" AND ").append(PaymentReadRepository.TRANSACTION_DATE).append(" < :end");
            parameters.put("end", OffsetDateTime.ofInstant(dates.end(), ZoneOffset.UTC));
        }
        if (type != null) {
            filter.append(" AND t.type = :type");
            parameters.put("type", type);
        }
        if (status != null) {
            filter.append(" AND t.status = :status");
            parameters.put("status", status);
        }
        if (orderId != null) {
            filter.append(" AND t.order_id = :orderId");
            parameters.put("orderId", orderId);
        }
        return page(query, filter.toString(), parameters);
    }

    public ReceptionistPaymentResponses.Page forRefundReview(Authentication actor, String id, LaboratoryQuery query) {
        access.current(actor, Role.ADMIN);
        var orderId = access.orderId(id);
        if (!orders.existsById(orderId))
            throw OrderException.missingOrder();
        return page(query, " WHERE t.order_id = :orderId", Map.of("orderId", orderId));
    }

    private ReceptionistPaymentResponses.Page page(LaboratoryQuery query, String where, Map<String, Object> parameters) {
        var totals = payments.totals(where, parameters);
        var content = payments.page(where, parameters, (long) query.page() * query.size(), query.size());
        long totalPages = Math.ceilDiv(totals.count(), query.size());
        return new ReceptionistPaymentResponses.Page(content, query.page(), query.size(), totals.count(),
                totalPages, query.page() == 0, (long) query.page() + 1 >= totalPages,
                HistoryDates.ZONE.getId(), totals.financial("ILS"));
    }

    public ReceptionistPaymentResponses.Transaction receipt(Authentication actor, String id) {
        access.current(actor, Role.RECEPTIONIST);
        return payments.find(LaboratoryInput.uuid(id, "id"))
                .orElseThrow(() -> LaboratoryException.missing("PAYMENT_TRANSACTION"));
    }

    public LaboratoryQuery.PageBody<ReceptionistPaymentResponses.EligibleOrder> eligibleOrders(
            Authentication actor, LaboratoryQuery query) {
        access.current(actor, Role.RECEPTIONIST);
        var page = payments.eligibleOrders(query.page(), query.size());
        return LaboratoryQuery.page(page, page.getContent());
    }

    private static String choice(LaboratoryQuery query, String field, Set<String> values) {
        var value = query.get(field, "ALL").toUpperCase(Locale.ROOT);
        if (value.equals("ALL"))
            return null;
        if (!values.contains(value))
            throw LaboratoryException.invalid(field);
        return value;
    }
}
