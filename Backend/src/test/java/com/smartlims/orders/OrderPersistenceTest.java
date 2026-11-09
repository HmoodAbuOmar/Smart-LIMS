package com.smartlims.orders;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.repository.PatientRepository;
import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@Transactional
class OrderPersistenceTest extends IsolatedPostgresTest {
    @Autowired
    TestOrderRepository orders;
    @Autowired
    UserAccountRepository users;
    @Autowired
    PatientRepository patients;
    @Autowired
    LabTestRepository tests;
    @Autowired
    EntityManager entities;
    @MockitoBean
    VerificationEmailSender email;

    private UserAccount actor() {
        return users.save(UserAccount.registerPatient("Synthetic order actor",
                UUID.randomUUID() + "@example.invalid", null));
    }

    private TestOrder order(UserAccount actor) {
        Patient patient = patients.save(new Patient("PAT-" + patients.nextPatientNumber(), actor,
                "Synthetic order profile", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null));
        return new TestOrder("ORD-%06d".formatted(orders.nextOrderNumber()), patient, actor,
                UUID.randomUUID(), "a".repeat(64));
    }

    private LabTest test(BigDecimal price) {
        return tests.save(new LabTest("SYN_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20).toUpperCase(),
                "Synthetic ordered test", null, price, "SYNTHETIC", null));
    }

    private TestOrder reload(UUID id) {
        entities.flush();
        entities.clear();
        return orders.findById(id).orElseThrow();
    }

    @Test
    void persistsAndReloadsTheAggregateAndDurableActorScopedRetryIdentity() {
        UserAccount actor = actor();
        TestOrder order = order(actor);
        LabTest first = test(new BigDecimal("25.50"));
        LabTest second = test(BigDecimal.ZERO.setScale(2));
        order.addItem(first);
        order.addItem(second);
        orders.saveAndFlush(order);
        UUID patientId = order.getPatient().getId();
        UUID actorId = actor.getId();
        TestOrder loaded = reload(order.getId());

        assertEquals(OrderStatus.PENDING, loaded.getStatus());
        assertEquals("ILS", loaded.getCurrency());
        assertEquals(patientId, loaded.getPatient().getId());
        assertNull(loaded.getPatient().getUser()); // Staff-selected profiles need not have an account.
        assertEquals(actorId, loaded.getCreatedBy().getId());
        assertEquals(order.getOrderNumber(), loaded.getOrderNumber());
        assertEquals(order.getIdempotencyKey(), loaded.getIdempotencyKey());
        assertEquals("a".repeat(64), loaded.getRequestHash()); // CHAR mapping also passes schema validation.
        assertNotNull(loaded.getCreatedAt());
        assertNotNull(loaded.getUpdatedAt());
        assertNull(loaded.getCancelledAt());
        assertNull(loaded.getCancelledBy());
        assertNull(loaded.getCancellationReason());
        assertEquals(2, loaded.getItems().size());
        for (var item : loaded.getItems()) {
            assertNotNull(item.getId());
            assertNotNull(item.getCreatedAt());
            assertEquals(loaded.getId(), item.getOrder().getId());
            assertEquals(item.getLabTest().getCode(), item.getTestCodeSnapshot());
            assertEquals(item.getLabTest().getName(), item.getTestNameSnapshot());
            assertEquals(item.getLabTest().getPrice(), item.getPriceAtOrder());
        }
        assertEquals(loaded.getId(), orders.findByCreatedBy_IdAndIdempotencyKey(actorId,
                loaded.getIdempotencyKey()).orElseThrow().getId());
        assertTrue(orders.findByCreatedBy_IdAndIdempotencyKey(UUID.randomUUID(), loaded.getIdempotencyKey()).isEmpty());
        assertThrows(UnsupportedOperationException.class, () -> loaded.getItems().clear());
        assertThrows(IllegalStateException.class, () -> loaded.addItem(first));
    }

    @Test
    void catalogChangesAndCancellationRetainOriginalSnapshotsAndRetryFields() {
        UserAccount actor = actor();
        TestOrder order = order(actor);
        LabTest test = test(new BigDecimal("25.50"));
        String originalCode = test.getCode();
        order.addItem(test);
        orders.saveAndFlush(order);
        UUID itemId = order.getItems().getFirst().getId();
        UUID retryKey = order.getIdempotencyKey();
        test.setCode("SYN_RENAMED");
        test.setName("Synthetic new catalog name");
        test.setPrice(new BigDecimal("99.99"));
        test.setActive(false);
        TestOrder loaded = reload(order.getId());
        Instant createdAt = loaded.getCreatedAt();
        assertEquals(originalCode, loaded.getItems().getFirst().getTestCodeSnapshot());
        assertEquals("Synthetic ordered test", loaded.getItems().getFirst().getTestNameSnapshot());
        assertEquals(new BigDecimal("25.50"), loaded.getItems().getFirst().getPriceAtOrder());

        // Mapping round-trip only; role/state/repeated-cancellation behavior belongs to Task 10.
        loaded.setStatus(OrderStatus.CANCELLED);
        loaded.setCancelledBy(users.getReferenceById(actor.getId()));
        loaded.setCancelledAt(createdAt.plusSeconds(1));
        loaded.setCancellationReason("Synthetic cancellation reason");
        loaded = reload(order.getId());
        assertEquals(OrderStatus.CANCELLED, loaded.getStatus());
        assertEquals(actor.getId(), loaded.getCancelledBy().getId());
        assertEquals(createdAt.plusSeconds(1), loaded.getCancelledAt());
        assertEquals("Synthetic cancellation reason", loaded.getCancellationReason());
        assertEquals(createdAt, loaded.getCreatedAt());
        assertFalse(loaded.getUpdatedAt().isBefore(createdAt));
        assertEquals(retryKey, loaded.getIdempotencyKey());
        assertEquals("a".repeat(64), loaded.getRequestHash());
        assertEquals(1, loaded.getItems().size());
        assertEquals(itemId, loaded.getItems().getFirst().getId());
        assertEquals(new BigDecimal("25.50"), loaded.getItems().getFirst().getPriceAtOrder());
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = {"PENDING", "IN_PROGRESS", "COMPLETED"})
    void mapsApprovedNonCancelledStorageStates(OrderStatus state) {
        TestOrder order = order(actor());
        order.addItem(test(new BigDecimal("1.00")));
        order.setStatus(state); // No workflow/transition authority is implied by persistence support.
        orders.saveAndFlush(order);
        TestOrder loaded = reload(order.getId());
        assertEquals(state, loaded.getStatus());
        assertNull(loaded.getCancelledBy());
        assertNull(loaded.getCancelledAt());
    }

    @Test
    void storesOneHundredMaximumPricesWithoutNarrowingTheAggregate() {
        TestOrder order = order(actor());
        for (int i = 0; i < 100; i++)
            order.addItem(test(new BigDecimal("9999999999.99")));
        orders.saveAndFlush(order);
        TestOrder loaded = reload(order.getId());
        assertEquals(100, loaded.getItems().size());
        BigDecimal expected = new BigDecimal("999999999999.00");
        assertEquals(expected, loaded.getItems().stream().map(item -> item.getPriceAtOrder())
                .reduce(new BigDecimal("0.00"), BigDecimal::add));
        assertEquals(expected, entities.createQuery(
                        "select sum(i.priceAtOrder) from OrderItem i where i.order.id = :id", BigDecimal.class)
                .setParameter("id", order.getId()).getSingleResult());
    }

    @Test
    void repositorySupportsCatalogSnapshotAndOrderWriteLocks() {
        TestOrder order = order(actor());
        LabTest test = test(new BigDecimal("1.00"));
        order.addItem(test);
        orders.saveAndFlush(order);
        entities.clear();
        LabTest snapshot = tests.findForSnapshot(test.getId()).orElseThrow();
        assertEquals(jakarta.persistence.LockModeType.PESSIMISTIC_READ, entities.getLockMode(snapshot));
        TestOrder locked = orders.findForUpdate(order.getId()).orElseThrow();
        assertEquals(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE, entities.getLockMode(locked));
        assertEquals(order.getId(), locked.getId());
        assertTrue(orders.findForUpdate(UUID.randomUUID()).isEmpty());
    }
}
