package com.smartlims.payments;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.AuditPublisher;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.service.OrderAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

import static com.smartlims.laboratory.dto.AuditOperation.REFUND_RECORD;

@Service
@Validated
public class RefundRecordingService {
    private final OrderAccess access;
    private final TestOrderRepository orders;
    private final PaymentReadRepository payments;
    private final AuditPublisher audit;

    public RefundRecordingService(OrderAccess access, TestOrderRepository orders, PaymentReadRepository payments,
                                  AuditPublisher audit) {
        this.access = access;
        this.orders = orders;
        this.payments = payments;
        this.audit = audit;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Result record(Authentication actor, String id, @NotNull @Valid RecordRefundRequest body, List<String> keys) {
        var account = access.current(actor, Role.ADMIN);
        var key = LaboratoryInput.key(keys);
        var paymentId = LaboratoryInput.uuid(body.originalPaymentId(), "originalPaymentId");
        var occurredAt = LaboratoryInput.time(body.occurredAt(), "occurredAt");
        var reason = LaboratoryInput.text(body.reason(), "reason", 1000, true);
        // Serialize refunds, desk payments, and cancellation on the same order row.
        var order = orders.findForUpdate(access.orderId(id)).orElseThrow(OrderException::missingOrder);
        var previous = payments.findRecording(account.getId(), key);
        if (previous.isPresent())
            return replay(previous.get(), order, paymentId, body, reason, occurredAt);

        if (order.getStatus() != OrderStatus.PENDING)
            throw OrderException.notCancellable();
        var original = payments.find(paymentId)
                .filter(payment -> payment.orderId().equals(order.getId()) && payment.type().equals("PAYMENT")
                        && payment.status().equals("CONFIRMED"))
                .orElseThrow(() -> LaboratoryException.missing("CONFIRMED_PAYMENT"));
        var now = LaboratoryInput.now();
        if (occurredAt.isBefore(original.transactionAt()) || occurredAt.isAfter(now))
            throw LaboratoryException.invalid("occurredAt");
        var financial = payments.financialForOrder(order.getId(), order.getCurrency());
        if (body.amount().compareTo(financial.netConfirmedCollections()) > 0)
            throw LaboratoryException.conflict("REFUND_EXCEEDS_AVAILABLE_AMOUNT");
        if (payments.hasUnallocatedRefunds(order.getId()))
            throw LaboratoryException.conflict("REFUND_RECONCILIATION_REQUIRED");
        if (body.amount().compareTo(original.amount().subtract(payments.refundedFrom(paymentId))) > 0)
            throw LaboratoryException.conflict("REFUND_EXCEEDS_AVAILABLE_AMOUNT");

        var refundId = UUID.randomUUID();
        if (!payments.insertRefund(refundId, original, account.getId(), key, body, reason,
                occurredAt.atOffset(ZoneOffset.UTC), now.atOffset(ZoneOffset.UTC))) {
            return payments.findRecording(account.getId(), key)
                    .map(row -> replay(row, order, paymentId, body, reason, occurredAt))
                    .orElseThrow(() -> LaboratoryException.conflict("REFUND_CONFIRMATION_ALREADY_RECORDED"));
        }
        audit.record(account, REFUND_RECORD, refundId);
        return result(payments.find(refundId).orElseThrow(), order, true);
    }

    private Result replay(ReceptionistPaymentResponses.Transaction row, TestOrder order, UUID originalId,
                          RecordRefundRequest body, String reason, Instant occurredAt) {
        var refund = row.refund();
        if (!order.getId().equals(row.orderId()) || refund == null || !refund.originalPaymentId().equals(originalId)
                || row.amount().compareTo(body.amount()) != 0 || !refund.reason().equals(reason)
                || !refund.confirmationReference().equals(body.confirmationReference())
                || !refund.occurredAt().equals(occurredAt))
            throw LaboratoryException.conflict("IDEMPOTENCY_KEY_REUSED");
        return result(row, order, false);
    }

    private Result result(ReceptionistPaymentResponses.Transaction row, TestOrder order, boolean created) {
        return new Result(new ReceptionistPaymentResponses.RecordedRefund(row,
                payments.financialForOrder(order.getId(), order.getCurrency())), created);
    }

    public record Result(ReceptionistPaymentResponses.RecordedRefund data, boolean created) {}
}
