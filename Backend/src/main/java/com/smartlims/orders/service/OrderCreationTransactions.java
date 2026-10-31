package com.smartlims.orders.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.LoginEligibility;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.orders.entity.TestOrder;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.mapper.OrderMapper;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.repository.PatientRepository;
import jakarta.persistence.EntityManager;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderCreationTransactions {
    private final UserAccountRepository users;
    private final PatientRepository patients;
    private final LabTestRepository tests;
    private final TestOrderRepository orders;
    private final OrderMapper mapper;
    private final EntityManager entities;
    private final com.smartlims.notifications.service.NotificationPublisher notifications;

    public OrderCreationTransactions(UserAccountRepository users, PatientRepository patients,
            LabTestRepository tests, TestOrderRepository orders, OrderMapper mapper, EntityManager entities,
            com.smartlims.notifications.service.NotificationPublisher notifications) {
        this.users = users;
        this.patients = patients;
        this.tests = tests;
        this.orders = orders;
        this.mapper = mapper;
        this.entities = entities;
        this.notifications = notifications;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public OrderCreationResult create(Authentication actor, boolean self, UUID patientId, List<UUID> testIds, UUID key) {
        Context context = context(actor, self, patientId, testIds);
        OrderCreationResult prior = existing(context, key);
        if (prior != null) return prior;
        // PostgreSQL UUID order is lexical/unsigned; UUID.compareTo uses signed longs instead.
        var selected = testIds.stream().sorted(Comparator.comparing(UUID::toString))
                .map(id -> tests.findForSnapshot(id).orElseThrow(OrderException::unavailable)).toList();
        if (selected.stream().anyMatch(test -> !test.isActive() || !"ILS".equals(test.getCurrency())))
            throw OrderException.unavailable();
        String number = String.format(Locale.ROOT, "ORD-%06d", orders.nextOrderNumber());
        TestOrder order = new TestOrder(number, context.patient(), context.actor(), key, context.hash());
        selected.forEach(order::addItem);
        orders.saveAndFlush(order);
        // Return database timestamp precision on both the initial response and subsequent replays.
        entities.refresh(order);
        notifications.order(order);
        return new OrderCreationResult(mapper.toDetail(order), true);
    }

    // Invoked only after the failed create's transaction has exited and rolled back.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public OrderCreationResult replay(Authentication actor, boolean self, UUID patientId, List<UUID> testIds, UUID key) {
        return existing(context(actor, self, patientId, testIds), key);
    }

    private Context context(Authentication actor, boolean self, UUID patientId, List<UUID> testIds) {
        if (actor == null || !actor.isAuthenticated()) throw OrderException.unauthenticated();
        List<Role> allowed = self ? List.of(Role.PATIENT) : List.of(Role.ADMIN, Role.RECEPTIONIST);
        if (allowed.stream().noneMatch(role -> actor.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_" + role)))) throw OrderException.forbidden();
        UUID actorId;
        try { actorId = UUID.fromString(actor.getName()); }
        catch (IllegalArgumentException | NullPointerException error) { throw OrderException.unauthenticated(); }
        UserAccount account = users.findWithLockById(actorId).orElseThrow(OrderException::unauthenticated);
        if (!LoginEligibility.eligible(account)) throw OrderException.unauthenticated();
        if (!allowed.contains(account.getRole())) throw OrderException.forbidden();
        UUID resolved = self ? patients.findByUser_Id(actorId).orElseThrow(OrderException::notLinked).getId() : patientId;
        Patient patient = patients.findWithLockById(resolved)
                .orElseThrow(() -> self ? OrderException.notLinked() : OrderException.missingPatient());
        if (self && (patient.getUser() == null || !patient.getUser().getId().equals(actorId))) throw OrderException.notLinked();
        return new Context(account, patient, OrderRequestFingerprint.hash(self, resolved, testIds));
    }

    private OrderCreationResult existing(Context context, UUID key) {
        return orders.findByCreatedBy_IdAndIdempotencyKey(context.actor().getId(), key).map(order -> {
            if (!order.getRequestHash().equals(context.hash()) || !order.getPatient().getId().equals(context.patient().getId()))
                throw OrderException.reusedKey();
            return new OrderCreationResult(mapper.toDetail(order), false);
        }).orElse(null);
    }

    private record Context(UserAccount actor, Patient patient, String hash) {}
}
