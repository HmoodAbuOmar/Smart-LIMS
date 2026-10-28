package com.smartlims.orders.service;

import com.smartlims.orders.dto.CreateSelfOrderRequest;
import com.smartlims.orders.dto.CreateStaffOrderRequest;
import com.smartlims.orders.exception.OrderException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class OrderService {
    private final OrderCreationTransactions transactions;

    public OrderService(OrderCreationTransactions transactions) { this.transactions = transactions; }

    public OrderCreationResult createMe(Authentication actor, @NotNull @Valid CreateSelfOrderRequest request, List<String> keys) {
        return create(actor, true, null, request.testIds(), key(keys));
    }

    public OrderCreationResult create(Authentication actor, @NotNull @Valid CreateStaffOrderRequest request, List<String> keys) {
        return create(actor, false, UUID.fromString(request.patientId()), request.testIds(), key(keys));
    }

    private UUID key(List<String> values) {
        if (values == null || values.size() != 1 || values.getFirst() == null
                || !values.getFirst().matches(CreateStaffOrderRequest.UUID_PATTERN)) throw OrderException.invalid("idempotencyKey");
        return UUID.fromString(values.getFirst());
    }

    private OrderCreationResult create(Authentication actor, boolean self, UUID patientId, List<String> selection, UUID key) {
        List<UUID> ids = selection.stream().map(UUID::fromString).toList();
        try { return transactions.create(actor, self, patientId, ids, key); }
        catch (DataIntegrityViolationException error) {
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (cause instanceof ConstraintViolationException violation
                        && "test_orders_creator_idempotency_key".equals(violation.getConstraintName())) {
                    OrderCreationResult winner = transactions.replay(actor, self, patientId, ids, key);
                    if (winner != null) return winner;
                    break;
                }
            }
            throw error;
        }
    }
}
