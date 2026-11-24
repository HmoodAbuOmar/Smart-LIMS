package com.smartlims.payments;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.service.OrderAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class ReceptionistPaymentRecordingService {
    private final OrderAccess access;
    private final TestOrderRepository orders;
    private final PaymentReadRepository payments;

    public ReceptionistPaymentRecordingService(OrderAccess access, TestOrderRepository orders,
                                                PaymentReadRepository payments) {
        this.access = access;
        this.orders = orders;
        this.payments = payments;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Recording record(Authentication actor, @NotNull @Valid RecordPaymentRequest body, List<String> keys) {
        var account = access.current(actor, Role.RECEPTIONIST);
        var key = LaboratoryInput.key(keys);
        var orderId = LaboratoryInput.uuid(body.orderId(), "orderId");
        // Also used by order cancellation. Recompute the balance after acquiring this lock.
        var order = orders.findForUpdate(orderId).orElseThrow(() -> LaboratoryException.missing("ORDER"));
        var previous = payments.findRecording(account.getId(), key);
        if (previous.isPresent())
            return replay(previous.get(), order, body);

        var balance = balance(order);
        if (order.getStatus() == OrderStatus.CANCELLED || !"ILS".equals(order.getCurrency())
                || balance.outstanding().signum() <= 0)
            throw LaboratoryException.conflict("ORDER_NOT_PAYABLE");
        if (body.amount().compareTo(balance.outstanding()) > 0)
            throw LaboratoryException.conflict("PAYMENT_EXCEEDS_OUTSTANDING");

        var id = UUID.randomUUID();
        var timestamp = OffsetDateTime.ofInstant(LaboratoryInput.now(), ZoneOffset.UTC);
        if (!payments.insertConfirmed(id, orderId, account.getId(), key, body.amount(), body.method(), timestamp))
            return replay(payments.findRecording(account.getId(), key).orElseThrow(), order, body);

        return new Recording(new ReceptionistPaymentResponses.Recorded(payments.find(id).orElseThrow(), balance(order)), true);
    }

    private Recording replay(ReceptionistPaymentResponses.Transaction previous, TestOrder order,
                             RecordPaymentRequest body) {
        if (!previous.orderId().equals(order.getId()) || !body.method().equals(previous.method())
                || body.amount().compareTo(previous.amount()) != 0)
            throw LaboratoryException.conflict("IDEMPOTENCY_KEY_REUSED");
        return new Recording(new ReceptionistPaymentResponses.Recorded(previous, balance(order)), false);
    }

    private ReceptionistPaymentResponses.Balance balance(TestOrder order) {
        var total = orders.findItemTotals(List.of(order.getId())).stream()
                .map(TestOrderRepository.ItemTotals::getTotalAmount).findFirst().orElse(new BigDecimal("0.00"));
        var financial = payments.financialForOrder(order.getId(), order.getCurrency());
        return ReceptionistPaymentResponses.Balance.of(total, financial.netConfirmedCollections(), order.getCurrency());
    }

    public record Recording(ReceptionistPaymentResponses.Recorded data, boolean created) {}
}
