package com.smartlims.payments;

import com.smartlims.laboratory.dto.FinancialSummary;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class PaymentReadRepository {
    static final String TRANSACTION_DATE = "COALESCE(t.confirmed_at, t.recorded_at)";
    private static final String FROM = """
            FROM payment_transactions t
            JOIN test_orders o ON o.id = t.order_id
            JOIN patients p ON p.id = o.patient_id
            """;
    private static final String SELECT = """
            SELECT t.*, o.order_number, o.currency, p.id AS patient_id, p.full_name, p.patient_number,
            """ + TRANSACTION_DATE + " AS transaction_at\n" + FROM;
    private static final String TOTALS = """
            SELECT count(*) AS total,
                   COALESCE(sum(t.amount) FILTER (WHERE t.type = 'PAYMENT' AND t.status = 'CONFIRMED'), 0) AS payments,
                   COALESCE(sum(t.amount) FILTER (WHERE t.type = 'REFUND' AND t.status = 'CONFIRMED'), 0) AS refunds,
                   COALESCE(sum(t.amount) FILTER (WHERE t.type = 'PAYMENT' AND t.status = 'PENDING'), 0) AS pending
            """;
    private static final String ELIGIBLE = """
            FROM test_orders o
            JOIN patients p ON p.id = o.patient_id
            CROSS JOIN LATERAL (
                SELECT COALESCE(sum(i.price_at_order), 0.00) AS total FROM order_items i WHERE i.order_id = o.id
            ) items
            CROSS JOIN LATERAL (
            """ + TOTALS + """
                FROM payment_transactions t WHERE t.order_id = o.id
            ) collected
            WHERE o.status <> 'CANCELLED' AND o.currency = 'ILS'
              AND items.total > collected.payments - collected.refunds
            """;
    private final JdbcClient jdbc;

    public PaymentReadRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<ReceptionistPaymentResponses.Transaction> page(String where, Map<String, Object> parameters,
                                                         long offset, int size) {
        return jdbc.sql(SELECT + where + " ORDER BY transaction_at DESC, t.id LIMIT :size OFFSET :offset")
                .params(parameters).param("size", size).param("offset", offset)
                .query((rs, row) -> transaction(rs)).list();
    }

    Optional<ReceptionistPaymentResponses.Transaction> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE t.id = :id").param("id", id)
                .query((rs, row) -> transaction(rs)).optional();
    }

    Optional<ReceptionistPaymentResponses.Transaction> findRecording(UUID actor, UUID key) {
        return jdbc.sql(SELECT + " WHERE t.recorded_by = :actor AND t.idempotency_key = :key")
                .param("actor", actor).param("key", key).query((rs, row) -> transaction(rs)).optional();
    }

    boolean insertConfirmed(UUID id, UUID orderId, UUID actor, UUID key, BigDecimal amount, String method,
                            OffsetDateTime timestamp) {
        return jdbc.sql("""
                INSERT INTO payment_transactions
                    (id, order_id, receipt_number, type, status, method, amount, recorded_at, confirmed_at,
                     recorded_by, idempotency_key)
                VALUES (:id, :orderId, :receipt, 'PAYMENT', 'CONFIRMED', :method, :amount, :at, :at, :actor, :key)
                ON CONFLICT (recorded_by, idempotency_key) DO NOTHING
                """).param("id", id).param("orderId", orderId).param("receipt", "REC-" + id)
                .param("method", method).param("amount", amount).param("at", timestamp)
                .param("actor", actor).param("key", key).update() == 1;
    }

    boolean insertRefund(UUID id, ReceptionistPaymentResponses.Transaction original, UUID actor, UUID key,
                         RecordRefundRequest request, String reason, OffsetDateTime occurredAt, OffsetDateTime recordedAt) {
        return jdbc.sql("""
                INSERT INTO payment_transactions
                    (id, order_id, receipt_number, type, status, method, amount, recorded_at, confirmed_at,
                     recorded_by, idempotency_key, original_payment_id, refund_reason,
                     refund_confirmation_reference, refund_occurred_at)
                SELECT :id, order_id, :receipt, 'REFUND', 'CONFIRMED', method, :amount, :recordedAt, :recordedAt,
                       :actor, :key, id, :reason, :confirmation, :occurredAt
                FROM payment_transactions WHERE id = :original
                ON CONFLICT DO NOTHING
                """).param("id", id).param("receipt", "REF-" + id).param("amount", request.amount())
                .param("recordedAt", recordedAt).param("actor", actor).param("key", key)
                .param("reason", reason).param("confirmation", request.confirmationReference())
                .param("occurredAt", occurredAt).param("original", original.id()).update() == 1;
    }

    boolean hasUnallocatedRefunds(UUID orderId) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM payment_transactions WHERE order_id = :orderId
                    AND type = 'REFUND' AND status = 'CONFIRMED' AND original_payment_id IS NULL)
                """).param("orderId", orderId).query(Boolean.class).single();
    }

    BigDecimal refundedFrom(UUID originalId) {
        return jdbc.sql("""
                SELECT COALESCE(sum(amount), 0.00) FROM payment_transactions
                WHERE original_payment_id = :id AND type = 'REFUND' AND status = 'CONFIRMED'
                """).param("id", originalId).query(BigDecimal.class).single();
    }

    Page<ReceptionistPaymentResponses.EligibleOrder> eligibleOrders(int page, int size) {
        var paging = PageRequest.of(page, size);
        long count = jdbc.sql("SELECT count(*) " + ELIGIBLE).query(Long.class).single();
        if (paging.getOffset() >= count)
            return new PageImpl<>(List.of(), paging, count);
        var rows = jdbc.sql("""
                SELECT o.id, o.order_number, p.id AS patient_id, p.full_name, o.currency, items.total,
                       collected.payments - collected.refunds AS paid
                """ + ELIGIBLE + " ORDER BY o.created_at DESC, o.id LIMIT :size OFFSET :offset")
                .param("size", size).param("offset", paging.getOffset())
                .query((rs, row) -> new ReceptionistPaymentResponses.EligibleOrder(
                        rs.getObject("id", UUID.class), rs.getString("order_number"),
                        rs.getObject("patient_id", UUID.class), rs.getString("full_name"),
                        ReceptionistPaymentResponses.Balance.of(rs.getBigDecimal("total"),
                                rs.getBigDecimal("paid").setScale(2), rs.getString("currency")))).list();
        return new PageImpl<>(rows, paging, count);
    }

    Totals totals(String where, Map<String, Object> parameters) {
        return jdbc.sql(TOTALS + FROM + where).params(parameters).query((rs, row) -> totals(rs)).single();
    }

    public FinancialSummary financialForOrder(UUID orderId, String currency) {
        return jdbc.sql(TOTALS + " FROM payment_transactions t WHERE t.order_id = :id")
                .param("id", orderId).query((rs, row) -> totals(rs)).single().financial(currency);
    }

    private static Totals totals(ResultSet rs) throws SQLException {
        return new Totals(rs.getLong("total"), rs.getBigDecimal("payments").setScale(2),
                rs.getBigDecimal("refunds").setScale(2), rs.getBigDecimal("pending").setScale(2));
    }

    private static ReceptionistPaymentResponses.Transaction transaction(ResultSet rs) throws SQLException {
        var original = rs.getObject("original_payment_id", UUID.class);
        var refund = original == null ? null : new ReceptionistPaymentResponses.RefundDetails(original,
                rs.getString("refund_reason"), rs.getObject("recorded_by", UUID.class),
                rs.getString("refund_confirmation_reference"), instant(rs, "refund_occurred_at"));
        return new ReceptionistPaymentResponses.Transaction(rs.getObject("id", UUID.class),
                rs.getString("receipt_number"), rs.getObject("order_id", UUID.class), rs.getString("order_number"),
                rs.getObject("patient_id", UUID.class), rs.getString("full_name"), rs.getString("patient_number"),
                rs.getString("type"), rs.getString("status"), rs.getString("method"), rs.getBigDecimal("amount"),
                rs.getString("currency"), instant(rs, "recorded_at"), instant(rs, "confirmed_at"),
                instant(rs, "transaction_at"), refund);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    record Totals(long count, BigDecimal payments, BigDecimal refunds, BigDecimal pending) {
        FinancialSummary financial(String currency) {
            return new FinancialSummary(true, currency, payments, refunds, payments.subtract(refunds), pending,
                    "payment_transactions");
        }
    }
}
